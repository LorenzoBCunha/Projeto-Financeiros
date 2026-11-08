const {withDangerousMod,withMainApplication}=require('@expo/config-plugins');
const fs=require('fs');const path=require('path');
module.exports=function withPinKdf(config){
 config=withMainApplication(config,config=>{const marker='add(FinanceirosPinPackage())';if(!config.modResults.contents.includes(marker)){const anchor='PackageList(this).packages.apply {';if(!config.modResults.contents.includes(anchor))throw new Error('Não foi possível registrar a proteção do PIN.');config.modResults.contents=config.modResults.contents.replace(anchor,`${anchor}\n          ${marker}`);}return config;});
 return withDangerousMod(config,['android',async config=>{const source=path.join(config.modRequest.projectRoot,'plugins','FinanceirosPinKdf.kt');const folder=path.join(config.modRequest.platformProjectRoot,'app','src','main','java','br','com','financeiros','pessoal');fs.mkdirSync(folder,{recursive:true});fs.copyFileSync(source,path.join(folder,'FinanceirosPinKdf.kt'));return config;}]);
};
