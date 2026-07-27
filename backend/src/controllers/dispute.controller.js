async function resolveDispute(req, res, next) {
  try {
    const { outcome, resolutionNotes } = req.body;
    const dispute = await prisma.dispute.findUnique({ where: { id: req.params.id }, include: { booking: true } });
    if (!dispute) return res.status(404).json({ error: 'Dispute not found.' });
    if (dispute.resolvedAt) return res.status(409).json({ error: 'Dispute already resolved.' });

    const { booking } = dispute;

    // booking.status is unreliable here: raiseDispute already overwrote it to
    // 'DISPUTED', so a status === 'COMPLETED' check can never be true. Check
    // the ledger directly instead - that record is never mutated after the fact.
    const alreadyPaid = await prisma.ledgerEntry.findFirst({
      where: { bookingId: booking.id, reason: 'BOOKING_COMPLETED' },
    });

    await prisma.$transaction(async (tx) => {
      if (outcome === 'PROVIDER' && booking.status !== 'COMPLETED') {