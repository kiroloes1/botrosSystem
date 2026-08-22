const mongoose=require("mongoose");

const userSchema=new mongoose.Schema({
    // personal information
 username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true }, 
  role: { type: String, enum: ['superadmin', 'manager'], default: 'manager' }, 
  notes: { type: String },
  phone:[{type:String}],
  isVerified: {
    type: Boolean,
    default: true
  },
  passwordChangedAt: Date,
  lastLogin: Date,

 refreshToken:{
    token:{type:String ,default:''},
    isRevoked:{type:Boolean,default:false},
  },
  passwordResetCode: {type: String},
  passwordResetExpires: Date,
  passwordResetAttempts :{
   type: Number,
   default:0
  },
  pandding:Date

},{timestamps:true});

const User=mongoose.model("User",userSchema);

module.exports=User;