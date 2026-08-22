const bcrypt = require('bcryptjs');
const { console } = require('inspector');
const jwt = require('jsonwebtoken');
const User = require(`${__dirname}/../../models/users`);
const nodemailer = require('nodemailer');


const {Resend} = require('resend');

//(Refresh Token)
exports.refreshToken = async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;

 
    if (!refreshToken) {
      return res.status(401).json({
        message: "لم يتم توفير رمز التحديث"
      });
    }

    let decoded;

  
    try {
      decoded = jwt.verify(refreshToken, process.env.REFRESH_JWT_SECRET);
    } catch (err) {
      res.clearCookie("refreshToken");
      return res.status(403).json({
        message: "رمز التحديث منتهي الصلاحية أو غير صالح"
      });
    }

    // البحث عن المستخدم
    const user = await User.findById(decoded.userId);

    if (!user || !user.refreshToken.token) {
      return res.status(403).json({
        message: "رمز التحديث غير صالح"
      });
    }

    // التحقق من تطابق الـ token
    const match = await bcrypt.compare(
      refreshToken,
      user.refreshToken.token
    );

    if (!match) {
      return res.status(403).json({
        message: "رمز التحديث غير متطابق"
      });
    }

    // إنشاء access token جديد
    const accessToken = jwt.sign(
      {
        userId: user._id,
        role: user.role
      },
      process.env.ACCESS_JWT_SECRET,
      {
        expiresIn: "15m"
      }
    );

    // إرسال الرد
    res.status(200).json({
      accessToken
    });

  } catch (err) {
    console.error("خطأ في تحديث الرمز:", err);

    res.status(500).json({
      message: "خطأ داخلي في الخادم",
      error: err.message
    });
  }
};
//login
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;


    if (!email || !password) {
      return res.status(400).json({ message: "الرجاء إدخال البريد الإلكتروني وكلمة المرور" });
    }


    const user = await User.findOne({ email }).select("+password");
    if (!user) {
      return res.status(401).json({ message: "البريد الإلكتروني أو كلمة المرور غير صحيحة" });
    }

    if(!user.isVerified){
      return res.status(401).json({ message: "هذا الايميل محظور من قبل الادمن تواصل مع الادمن "});
    }

    
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: "البريد الإلكتروني أو كلمة المرور غير صحيحة" });
    }



  

    const refreshPayload = {
      userId: user._id,
      role: user.role,
      email: user.email
    };

    const refreshToken = jwt.sign(
      refreshPayload,
      process.env.REFRESH_JWT_SECRET,
      { expiresIn: user.role === "superadmin" ? "1d" : "1d" }
    );

    user.refreshToken.token = await bcrypt.hash(refreshToken, 10);
    user.refreshToken.isRevoked = false;
    user.lastLogin = new Date();
    await user.save();

    // res.cookie("refreshToken", refreshToken, {
    //   httpOnly: true,
    //   sameSite: "lax",
    //   secure: false, 
    //   maxAge: user.role === "admin"
    //     ? 7 * 24 * 60 * 60 * 1000
    //     : 24 * 60 * 60 * 1000
    // });

    res.cookie("refreshToken", refreshToken, {
  httpOnly: true,
  sameSite: "none",        // مهم جدًا
  secure: true,            // لازم مع none
  maxAge: user.role === "admin"
    ? 7 * 24 * 60 * 60 * 1000
    : 24 * 60 * 60 * 1000
});

  
    const accessToken = jwt.sign(
      refreshPayload,
      process.env.ACCESS_JWT_SECRET,
      { expiresIn: "15m" }
    );

    res.status(200).json({
      message: `تم تسجيل دخول ${user.role} بنجاح`,
      accessToken
    });

  } catch (err) {
    console.error("خطأ في تسجيل الدخول:", err);
    res.status(500).json({
      message: "خطأ داخلي في الخادم",
      error: err.message
    });
  }
};

// logout
exports.userLogout = async (req, res) => {
  try {
    const userId = req.user.userId; // من middleware
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "المشرف غير موجود" });

    user.refreshToken.token = null;
    await user.save();

    res.clearCookie("refreshToken");
    res.status(200).json({ message: "تم تسجيل خروج المشرف بنجاح" });
  } catch (err) {
    console.error("خطأ في تسجيل خروج المشرف:", err);
    res.status(500).json({ message: "خطأ داخلي في الخادم", error: err.message });
  }
};

// updatePassword
exports.updatePassword = async(req,res)=>{
       const { currentPassword, newPassword}=req.body;
       const userId=req.user.userId;

       try{
               
            if(!currentPassword || !newPassword){
            return res.status(400).json({message:"الرجاء توفير جميع الحقول المطلوبة"});
            }
            const user=await User.findById(userId).select('+password');;
            if(!user){
                return res.status(404).json({message:"المستخدم غير موجود"});
            }
           
            const verifyPassword=await bcrypt.compare(currentPassword,user.password);
            if(!verifyPassword){
                return res.status(401).json({message:"كلمة المرور الحالية غير صحيحة",user:user});
            }
            const hashedPassword=await bcrypt.hash(newPassword,10);

            user.password=hashedPassword;
            user.passwordChangedAt=Date.now();
            user.refreshToken.token=null;
            await user.save();
            res.status(200).json({message:"تم تحديث كلمة المرور بنجاح"});


  
     
       } catch (err) {
            res.status(500).json({ message: 'خطأ داخلي في الخادم', error: err.message });
        }
}

//forgetPassword
exports.forgetPassword = async (req, res) => {
  const { email } = req.body;

  try {
    if (!email) {
      return res.status(400).json({ message: "الرجاء إدخال بريدك الإلكتروني" });
    }

    const user = await User.findOne({ email: email });
    if (!user) {
      return res.status(404).json({
        message: "إذا كان البريد الإلكتروني موجوداً، تم إرسال رابط إعادة التعيين"
      });
    }

    // إنشاء رمز إعادة التعيين وتاريخ الانتهاء
    const resetCode = Math.floor(100000 + Math.random() * 900000); // 6 أرقام
    const resetExpires = Date.now() + 5 * 60 * 1000; // 5 دقائق
    const hashedResetCode = await bcrypt.hash(resetCode.toString(), 10);

    if (user.passwordResetAttempts >= 5) {
      user.pandding = Date.now() + 60 * 60 * 1000; // ساعة واحدة
      user.passwordResetAttempts = 0;
      await user.save();
      return res.status(429).json({
        message: "محاولات إعادة تعيين كلمة المرور كثيرة. الرجاء المحاولة لاحقاً."
      });
    }

    if (user.pandding && Date.now() < user.pandding) {
      return res.status(429).json({
        message: "محاولات إعادة تعيين كلمة المرور كثيرة. الرجاء المحاولة لاحقاً."
      });
    }

    user.passwordResetCode = hashedResetCode;
    user.passwordResetExpires = resetExpires;
    user.passwordResetAttempts += 1;
    await user.save();

    // إعداد SMTP
    const transporter = nodemailer.createTransport({
      service: "gmail", // أو أي خدمة بريدية أخرى
      auth: {
        user: process.env.EMAIL_USER, 
        pass: process.env.EMAIL_PASS, 
      },
    });

    // إرسال الإيميل
    await transporter.sendMail({
      from: `"Acme" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: "رمز إعادة تعيين كلمة المرور",
      html: `<p>رمز إعادة التعيين الخاص بك هو: <strong>${resetCode}</strong></p>`,
    });

    res.status(200).json({
      message: "إذا كان البريد الإلكتروني موجوداً، تم إرسال رابط إعادة التعيين"
    });
  } catch (err) {
    res.status(500).json({ message: "خطأ داخلي في الخادم", error: err.message });
  }
};

// resetPassword
exports.resetPassword = async(req,res)=>{
    const {email,resetCode,newPassword}=req.body;

    try{
        if(!email || !resetCode || !newPassword){
            return res.status(400).json({message:"الرجاء توفير جميع الحقول المطلوبة"});
        }
        const user=await User.findOne({email:email});
        if(!user){
            return res.status(400).json({message:"البريد الإلكتروني أو رمز إعادة التعيين غير صالح"});
        }
    
        if(Date.now()>user.passwordResetExpires){
            return res.status(400).json({message:"انتهت صلاحية رمز إعادة التعيين"});
        }
        const isCodeValid=await bcrypt.compare(resetCode.toString(),user.passwordResetCode);
        if(!isCodeValid){
            return res.status(400).json({message:"البريد الإلكتروني أو رمز إعادة التعيين غير صالح"});
        }

        const hashedPassword=await bcrypt.hash(newPassword,10);
        user.password=hashedPassword;
        user.passwordResetCode=null;
        user.passwordResetExpires=null;
        user.passwordResetAttempts=0;
        user.passwordChangedAt=Date.now();
        user.refreshToken.token=null;
        await user.save();
        res.status(200).json({message:"تم إعادة تعيين كلمة المرور بنجاح"});
       
    }catch(err){
        res.status(500).json({ message: 'خطأ داخلي في الخادم', error: err.message });
    }
     
}

exports.auth=async(req,res)=>{
  try{
      const { email } = req.user;

      if (!email ) {
      return res.status(400).json({ message: "خطاء في المصادقه" });
    }


    const user = await User.findOne({ email },{username:1,role:1,email:1,isVerified:1}).select("-password");
    if (!user) {
      return res.status(401).json({ message: "غير مسموح لك للدخول لهذا السيستم" });
    }

    if(!user.isVerified){
      return res.status(401).json({ message: "هذا المستخدم محظور من قبل الادمن تواصل مع الادمن "});
    }

      res.status(200).json({
      user
    });

    

  }catch(err){

    res.status(500).json({
      message: "خطأ داخلي في الخادم",
      error: err.message
    });
  }
}

exports.getInfo = async (req, res) => {
  try {
    const { ID } = req.params;



    const user = await User.findById(ID).select("username role email");



    return res.status(200).json({
      success: true,
      user,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "خطأ داخلي في الخادم",
      error: err.message,
    });
  }
};





