const db = require('../db');

exports.createTicket = async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;
    
    // user ID is optional in case a guest submits, but since it's the user-app, 
    // authMiddleware provides req.user.userId
    const userId = req.user ? req.user.userId : null;

    if (!name || !email || !subject || !message) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const ticket = await db.supportTickets.create({
      user_id: userId,
      name,
      email,
      subject,
      message,
      status: 'open'
    });

    res.status(201).json({ success: true, ticket });
  } catch (error) {
    console.error('Error creating support ticket:', error);
    res.status(500).json({ error: error.message || 'Failed to submit support ticket' });
  }
};
