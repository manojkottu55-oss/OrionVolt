const requiredFields = (fields) => {
  return (req, res, next) => {
    const missing = fields.filter((field) => {
      const value = req.body[field];
      return value === undefined || value === null || value === '';
    });

    if (missing.length > 0) {
      return res.status(400).json({ error: 'Missing required fields', missing });
    }
    next();
  };
};

const isValidMobile = (str) => {
  return typeof str === 'string' && /^\d{10}$/.test(str);
};

const isValidEnum = (value, allowed) => {
  return allowed.includes(value);
};

module.exports = {
  requiredFields,
  isValidMobile,
  isValidEnum
};
