const db = require('../db');

exports.getProfile = async (req, res) => {
  try {
    const userId = req.user.userId;
    
    // Fetch profile
    let profile = await db.profiles.findById(userId);
    if (!profile) {
      // In case user hasn't been created in profiles table for some reason
      profile = await db.profiles.findOrCreate(userId, {
        email: req.user.email
      });
    }

    // Fetch vehicles
    const vehicles = await db.userVehicles.findByUserId(userId);

    res.json({
      success: true,
      profile: {
        id: profile.id,
        name: profile.name,
        email: profile.email,
        mobile_number: profile.mobile_number,
        profile_completed: profile.profile_completed,
        created_at: profile.created_at
      },
      vehicles
    });
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch profile' });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { name, mobileNumber, profileCompleted } = req.body;

    const updatedProfile = await db.profiles.update(userId, {
      name,
      mobileNumber,
      profileCompleted
    });

    res.json({ success: true, profile: updatedProfile });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ error: error.message || 'Failed to update profile' });
  }
};

exports.addVehicle = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { vehicleType, company, vehicleId, registrationNumber, isDefault } = req.body;

    if (!vehicleType || !company || !vehicleId) {
      return res.status(400).json({ error: 'Missing required vehicle fields' });
    }

    const newVehicle = await db.userVehicles.create(userId, {
      vehicleType,
      company,
      vehicleId,
      registrationNumber,
      isDefault
    });

    res.json({ success: true, vehicle: newVehicle });
  } catch (error) {
    console.error('Error adding vehicle:', error);
    res.status(500).json({ error: error.message || 'Failed to add vehicle' });
  }
};

exports.removeVehicle = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    await db.userVehicles.remove(userId, id);

    res.json({ success: true, message: 'Vehicle removed successfully' });
  } catch (error) {
    console.error('Error removing vehicle:', error);
    res.status(500).json({ error: error.message || 'Failed to remove vehicle' });
  }
};

exports.setDefaultVehicle = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    const updatedVehicle = await db.userVehicles.updateDefault(userId, id);

    res.json({ success: true, vehicle: updatedVehicle });
  } catch (error) {
    console.error('Error setting default vehicle:', error);
    res.status(500).json({ error: error.message || 'Failed to set default vehicle' });
  }
};
