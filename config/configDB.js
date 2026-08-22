const mongoose = require('mongoose');

exports.connectDB = async (url) => {
  try {
    await mongoose.connect(url); 
    console.log('MongoDB Connected');
  } catch (error) {
    console.error('MongoDB connection error:', error.message);
    process.exit(1);
  }
};

