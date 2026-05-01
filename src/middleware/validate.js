/**
 * Lightweight body validator.
 * schema: { fieldName: { required?: bool, type?: string, maxLength?: number, min?: number, max?: number } }
 */
function validate(schema) {
  return (req, res, next) => {
    const errors = {};

    for (const [field, rules] of Object.entries(schema)) {
      const value = req.body[field];
      const missing = value === undefined || value === null || value === '';

      if (rules.required && missing) {
        errors[field] = 'Required';
        continue;
      }
      if (missing) continue;

      if (rules.type === 'string' && typeof value !== 'string') {
        errors[field] = 'Must be a string';
      } else if (rules.type === 'number' && typeof value !== 'number') {
        errors[field] = 'Must be a number';
      } else if (rules.type === 'boolean' && typeof value !== 'boolean') {
        errors[field] = 'Must be a boolean';
      } else if (rules.type === 'array' && !Array.isArray(value)) {
        errors[field] = 'Must be an array';
      }

      if (rules.maxLength && typeof value === 'string' && value.length > rules.maxLength) {
        errors[field] = `Must be at most ${rules.maxLength} characters`;
      }
      if (rules.min !== undefined && value < rules.min) {
        errors[field] = `Must be at least ${rules.min}`;
      }
      if (rules.max !== undefined && value > rules.max) {
        errors[field] = `Must be at most ${rules.max}`;
      }
    }

    if (Object.keys(errors).length > 0) {
      return res.status(400).json({ error: 'Validation failed', fields: errors });
    }

    next();
  };
}

module.exports = validate;
