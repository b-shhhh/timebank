const { validationResult } = require('express-validator');

// Runs after an array of express-validator checks; returns a uniform 400
// with field-level errors instead of letting bad input reach controllers.
// This is the primary defence against injection and mass-assignment style
// input, alongside Prisma's parameterised queries and the explicit
// field allow-lists used in controllers (see profile.controller.js).
function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Validation failed.', details: errors.array() });
  }
  next();
}

module.exports = validate;
