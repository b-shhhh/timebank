const prisma = require('../config/db');
const { recordActivity } = require('../utils/logger');

async function loadDisputeByBookingId(req) {
  const booking = await prisma.booking.findUnique({ where: { id: req.params.bookingId } });
  if (!booking) return null;
  return { ...booking, providerId: booking.providerId, requesterId: booking.requesterId };
}

// POST /api/bookings/:bookingId/dispute - either party can raise one.
async function raiseDispute(req, res, next) {
  try {
    const booking = req.resource;
    if (!['ACCEPTED', 'COMPLETED'].includes(booking.status)) {
      return res.status(409).json({ error: 'Disputes can only be raised on accepted or completed bookings.' });
    }
    const existing = await prisma.dispute.findUnique({ where: { bookingId: booking.id } });
    if (existing) return res.status(409).json({ error: 'A dispute already exists for this booking.' });

    const dispute = await prisma.$transaction(async (tx) => {
      const d = await tx.dispute.create({
        data: { bookingId: booking.id, raisedById: req.user.id, reason: String(req.body.reason || '').slice(0, 1000) },
      });
      await tx.booking.update({ where: { id: booking.id }, data: { status: 'DISPUTED' } });
      return d;
    });

    await recordActivity({ userId: req.user.id, action: 'DISPUTE_RAISED', req, targetType: 'Dispute', targetId: dispute.id });
    res.status(201).json(dispute);
  } catch (err) {
    next(err);
  }
}

// GET /api/disputes - MEDIATOR/ADMIN only (enforced by requireRole in routes).
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

// PATCH /api/disputes/:id/resolve - MEDIATOR/ADMIN only. Mediator decides
// whether credits move (favouring provider) or reverse/stay (favouring
// requester); this happens atomically alongside marking the dispute
// resolved, same rollback-safety pattern as completeBooking.
async function resolveDispute(req, res, next) {
  try {
    const { outcome, resolutionNotes } = req.body; // outcome: 'PROVIDER' | 'REQUESTER' | 'SPLIT'
    const dispute = await prisma.dispute.findUnique({ where: { id: req.params.id }, include: { booking: true } });
    if (!dispute) return res.status(404).json({ error: 'Dispute not found.' });
    if (dispute.resolvedAt) return res.status(409).json({ error: 'Dispute already resolved.' });

    const { booking } = dispute;

    await prisma.$transaction(async (tx) => {
      if (outcome === 'PROVIDER' && booking.status !== 'COMPLETED') {
        // Provider wins: transfer credits as if completed normally.
        await tx.user.update({ where: { id: booking.requesterId }, data: { timeCredits: { decrement: booking.hours } } });
        await tx.user.update({ where: { id: booking.providerId }, data: { timeCredits: { increment: booking.hours } } });
        await tx.ledgerEntry.create({ data: { userId: booking.requesterId, bookingId: booking.id, amount: -booking.hours, reason: 'DISPUTE_RESOLVED_DEBIT' } });
        await tx.ledgerEntry.create({ data: { userId: booking.providerId, bookingId: booking.id, amount: booking.hours, reason: 'DISPUTE_RESOLVED_CREDIT' } });
        await tx.booking.update({ where: { id: booking.id }, data: { status: 'COMPLETED' } });
      } else if (outcome === 'REQUESTER') {
        // Requester wins: no credits move; if they'd already been debited
        // (booking was COMPLETED before the dispute), reverse it.
        if (booking.status === 'COMPLETED') {
          await tx.user.update({ where: { id: booking.requesterId }, data: { timeCredits: { increment: booking.hours } } });
          await tx.user.update({ where: { id: booking.providerId }, data: { timeCredits: { decrement: booking.hours } } });
          await tx.ledgerEntry.create({ data: { userId: booking.requesterId, bookingId: booking.id, amount: booking.hours, reason: 'DISPUTE_RESOLVED_CREDIT' } });
          await tx.ledgerEntry.create({ data: { userId: booking.providerId, bookingId: booking.id, amount: -booking.hours, reason: 'DISPUTE_RESOLVED_DEBIT' } });
        }
        await tx.booking.update({ where: { id: booking.id }, data: { status: 'CANCELLED' } });
      } else {
        // SPLIT or unrecognised outcome: no credit movement, just close
        // the booking as cancelled and record the mediator's notes.
        await tx.booking.update({ where: { id: booking.id }, data: { status: 'CANCELLED' } });
      }

      await tx.dispute.update({
        where: { id: dispute.id },
        data: { mediatorId: req.user.id, resolution: `${outcome}: ${resolutionNotes || ''}`.slice(0, 1000), resolvedAt: new Date() },
      });
    });

    await recordActivity({ userId: req.user.id, action: 'DISPUTE_RESOLVED', req, targetType: 'Dispute', targetId: dispute.id, metadata: { outcome } });
    res.status(200).json({ message: 'Dispute resolved.' });
  } catch (err) {
    next(err);
  }
}

module.exports = { loadDisputeByBookingId, raiseDispute, listOpenDisputes, resolveDispute };
