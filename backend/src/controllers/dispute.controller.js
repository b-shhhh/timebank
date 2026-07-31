const prisma = require('../config/db');
const { recordActivity } = require('../utils/logger');
const xss = require('xss');

async function loadDisputeByBookingId(req) {
  const booking = await prisma.booking.findUnique({ where: { id: req.params.bookingId } });
  if (!booking) return null;
  return { ...booking, providerId: booking.providerId, requesterId: booking.requesterId };
}

async function raiseDispute(req, res, next) {
  try {
    const booking = req.resource;
    if (!['ACCEPTED', 'COMPLETED'].includes(booking.status)) {
      return res.status(409).json({ error: 'Disputes can only be raised on accepted or completed bookings.' });
    }

    const existing = await prisma.dispute.findUnique({ where: { bookingId: booking.id } });
    if (existing) return res.status(409).json({ error: 'A dispute already exists for this booking.' });

    // Sanitize the reason the same way profile.controller.js sanitizes bio/
    // displayName. React's default JSX escaping already prevents this from
    // executing in the current frontend, but relying solely on the renderer
    // as the only defense is fragile — any future component that renders
    // this field via dangerouslySetInnerHTML (or a non-React client, e.g.
    // a future admin CLI/export) would be immediately exploitable. Sanitize
    // at the point of storage instead of trusting every future consumer.
    const reason = xss(String(req.body.reason || '').trim());

    let dispute;
    try {
      dispute = await prisma.$transaction(async (tx) => {
        const d = await tx.dispute.create({
          data: { bookingId: booking.id, raisedById: req.user.id, reason },
        });
        await tx.booking.update({ where: { id: booking.id }, data: { status: 'DISPUTED' } });
        return d;
      });
    } catch (txErr) {
      // Race condition fix: the existence check above and this create() are
      // not atomic, so two near-simultaneous requests can both pass the
      // check and both attempt to create a dispute for the same booking.
      // The DB's unique constraint on bookingId correctly stops the second
      // one, but Prisma surfaces that as a raw exception (code P2002) that
      // was previously falling through to the generic error handler and
      // leaking the full stack trace, file path, and query internals in
      // the response body (confirmed via Burp Intruder fuzzing). Catch it
      // here and return the same clean 409 the pre-check was meant to give.
      if (txErr.code === 'P2002') {
        return res.status(409).json({ error: 'A dispute already exists for this booking.' });
      }
      throw txErr;
    }

    await recordActivity({ userId: req.user.id, action: 'DISPUTE_RAISED', req, targetType: 'Dispute', targetId: dispute.id });
    res.status(201).json(dispute);
  } catch (err) {
    next(err);
  }
}

async function listOpenDisputes(req, res, next) {
  try {
    const disputes = await prisma.dispute.findMany({
      where: { resolvedAt: null },
      include: { booking: true },
      orderBy: { createdAt: 'asc' },
    });
    res.status(200).json(disputes);
  } catch (err) {
    next(err);
  }
}

async function resolveDispute(req, res, next) {
  try {
    const { outcome, resolutionNotes } = req.body;
    const dispute = await prisma.dispute.findUnique({ where: { id: req.params.id }, include: { booking: true } });
    if (!dispute) return res.status(404).json({ error: 'Dispute not found.' });
    if (dispute.resolvedAt) return res.status(409).json({ error: 'Dispute already resolved.' });

    const { booking } = dispute;

    // booking.status is unreliable here: raiseDispute already overwrote it to
    // 'DISPUTED', so a status === 'COMPLETED' check would never be true.
    // Checking the ledger instead reflects whether payment actually happened,
    // regardless of the booking's current (mutated) status.
    const alreadyPaid = await prisma.ledgerEntry.findFirst({
      where: { bookingId: booking.id, reason: 'BOOKING_COMPLETED' },
    });

    await prisma.$transaction(async (tx) => {
      if (outcome === 'PROVIDER' && !alreadyPaid) {
        const requester = await tx.user.findUnique({ where: { id: booking.requesterId } });
        if (requester.timeCredits < booking.hours) {
          throw Object.assign(new Error('Requester has insufficient credits to complete this transfer.'), { status: 409 });
        }
        await tx.user.update({ where: { id: booking.requesterId }, data: { timeCredits: { decrement: booking.hours } } });
        await tx.user.update({ where: { id: booking.providerId }, data: { timeCredits: { increment: booking.hours } } });
        await tx.ledgerEntry.create({ data: { userId: booking.requesterId, bookingId: booking.id, amount: -booking.hours, reason: 'DISPUTE_RESOLVED_PROVIDER' } });
        await tx.ledgerEntry.create({ data: { userId: booking.providerId, bookingId: booking.id, amount: booking.hours, reason: 'DISPUTE_RESOLVED_PROVIDER' } });
        await tx.booking.update({ where: { id: booking.id }, data: { status: 'COMPLETED' } });
      } else if (outcome === 'REQUESTER') {
        if (alreadyPaid) {
          const provider = await tx.user.findUnique({ where: { id: booking.providerId } });
          if (provider.timeCredits < booking.hours) {
            throw Object.assign(new Error('Provider has insufficient credits to reverse this transfer.'), { status: 409 });
          }
          await tx.user.update({ where: { id: booking.requesterId }, data: { timeCredits: { increment: booking.hours } } });
          await tx.user.update({ where: { id: booking.providerId }, data: { timeCredits: { decrement: booking.hours } } });
          await tx.ledgerEntry.create({ data: { userId: booking.requesterId, bookingId: booking.id, amount: booking.hours, reason: 'DISPUTE_RESOLVED_REQUESTER' } });
          await tx.ledgerEntry.create({ data: { userId: booking.providerId, bookingId: booking.id, amount: -booking.hours, reason: 'DISPUTE_RESOLVED_REQUESTER' } });
        }
        await tx.booking.update({ where: { id: booking.id }, data: { status: 'CANCELLED' } });
      } else {
        await tx.booking.update({ where: { id: booking.id }, data: { status: 'CANCELLED' } });
      }

      await tx.dispute.update({
        where: { id: dispute.id },
        data: { mediatorId: req.user.id, resolution: `${outcome}: ${resolutionNotes || ''}`.trim(), resolvedAt: new Date() },
      });
    });

    await recordActivity({ userId: req.user.id, action: 'DISPUTE_RESOLVED', req, targetType: 'Dispute', targetId: dispute.id, metadata: { outcome } });
    res.status(200).json({ message: 'Dispute resolved.' });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
}

module.exports = { loadDisputeByBookingId, raiseDispute, listOpenDisputes, resolveDispute };