exports.role=(...role)=>{
    return (req,res,next)=>{

        if(req.system){
     
             return     next();
        }
         if (!req.user || !req.user.role) {
        return res.status(401).json({ message: "غير مصرح" });
        }
        
        

        if(!role.includes(req.user.role)){
            return res.status(403).json({message:"غير مصرح لك الوصول لهذا الصفحه او انشاء هذه العمليه "});
        }
        next();
    }
}