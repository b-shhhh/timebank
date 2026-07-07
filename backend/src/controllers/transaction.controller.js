const prisma = require('../config/db');
const { recordActivity } = require('../utils/logger');

async function createBooking(req, res, next) {
  try {
    const { providerId, skill, hours, scheduledFor } = req.body;
    if (providerId === req.user.id) {
      return res.status(400).json({ error: 'You cannot book a session with yourself.' });
    }
    const provider = await prisma.user.findUnique({ where: { id: providerId } });
    if (!provider) return res.status(404).json({ error: 'Provider not found.' });

    const hrs = Math.max(1, Math.min(8, parseInt(hours, 10) || 1));
    const booking = await prisma.booking.create({
      data: {
        providerId,
        requesterId: req.user.id,
        skill: String(skill).slice(0, 80),
        hours: hrs,
        scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
      },
    });
    await recordActivity({ userId: req.user.id, action: 'BOOKING_REQUESTED', req, targetType: 'Booking', targetId: booking.id });
    res.status(201).json(booking);
  } catch (err) {
    next(err);
  }
}

async function loadBooking(req) {
  return prisma.booking.findUnique({ where: { id: req.params.id } });
}

async function acceptBooking(req, res, next) {
  try {
    const booking = req.resource;
    if (req.user.id !== booking.providerId) {
      return res.status(403).json({ error: 'Only the assigned provider can accept this booking.' });
    }
    if (booking.status !== 'REQUESTED') {
      return res.status(409).json({ error: `Booking cannot be accepted from status ${booking.status}.` });
    }
    const updated = await prisma.booking.update({ where: { id: booking.id }, data: { status: 'ACCEPTED' } });
    await recordActivity({ userId: req.user.id, action: 'BOOKING_ACCEPTED', req, targetType: 'Booking', targetId: booking.id });
    res.status(200).json(updated);
  } catch (err) {
    next(err);
  }
}

async function completeBooking(req, res, next) {
  try {
    const booking = req.resource;
    if (req.user.id !== booking.requesterId) {
      return res.status(403).json({ error: 'Only the requester can confirm completion.' });
    }
    if (booking.status !== 'ACCEPTED') {
      return res.status(409).json({ error: `Booking cannot be completed from status ${booking.status}.` });
    }

    const requester = await prisma.user.findUnique({ where: { id: booking.requesterId } });
    if (requester.timeCredits < booking.hours) {
      return res.status(402).json({ error: 'Insufficient time credits to complete this booking.' });
    }

    const result = await prisma.$transaction(async (tx) => {
      const updatedBooking = await tx.booking.update({
        where: { id: booking.id },
        data: { status: 'COMPLETED' },
      });

      const freshRequester = await tx.user.findUnique({ where: { id: booking.requesterId } });
      if (freshRequester.timeCredits < booking.hours) {
        throw Object.assign(new Error('Insufficient time credits to complete this booking.'), { status: 402 });
      }

      await tx.user.update({
        where: { id: booking.requesterId },
        data: { timeCredits: { decrement: booking.hours } },
      });
      await tx.user.update({
        where: { id: booking.providerId },
        data: { timeCredits: { increment: booking.hours } },
      });

      await tx.ledgerEntry.create({
        data: { userId: booking.requesterId, bookingId: booking.id, amount: -booking.hours, reason: 'BOOKING_COMPLETED' },
      });
      await tx.ledgerEntry.create({
        data: { userId: booking.providerId, bookingId: booking.id, amount: booking.hours, reason: 'BOOKING_COMPLETED' },
      });

      return updatedBooking;
    });

    await recordActivity({
      userId: req.user.id, action: 'BOOKING_COMPLETED_CREDITS_TRANSFERRED', req,
      targetType: 'Booking', targetId: booking.id, metadata: { hours: booking.hours },
    });
    res.status(200).json(result);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
}

async function cancelBooking(req, res, next) {
  try {
    const booking = req.resource;
    const isParty = [booking.providerId, booking.requesterId].includes(req.user.id);
    if (!isParty) return res.status(403).json({ error: 'Not a party to this booking.' });
    if (!['REQUESTED', 'ACCEPTED'].includes(booking.status)) {
      return res.status(409).json({ error: `Booking cannot be cancelled from status ${booking.status}.` });
    }
    const updated = await prisma.booking.update({ where: { id: booking.id }, data: { status: 'CANCELLED' } });
    await recordActivity({ userId: req.user.id, action: 'BOOKING_CANCELLED', req, targetType: 'Booking', targetId: booking.id });
    res.status(200).json(updated);
  } catch (err) {
    next(err);
  }
}

async function myBookings(req, res, next) {
  try {
    const bookings = await prisma.booking.findMany({
      where: { OR: [{ providerId: req.user.id }, { requesterId: req.user.id }] },
      orderBy: { createdAt: 'desc' },
      include: { provider: { select: { id: true, displayName: true } }, requester: { select: { id: true, displayName: true } } },
    });
    res.status(200).json(bookings);
  } catch (err) {
    next(err);
  }
}

async function myLedger(req, res, next) {
  try {
    const entries = await prisma.ledgerEntry.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
    });
    res.status(200).json(entries);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createBooking, loadBooking, acceptBooking, completeBooking, cancelBooking, myBookings, myLedger,
};
