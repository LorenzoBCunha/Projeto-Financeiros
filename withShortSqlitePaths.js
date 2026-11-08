const {withAppBuildGradle,withDangerousMod}=require('@expo/config-plugins');
const fs=require('fs');
const path=require('path');
module.exports = config => {
  config=withAppBuildGradle(config,mod=>{
    const marker='-DCMAKE_OBJECT_PATH_MAX=240';
    if(!mod.modResults.contents.includes(marker)) {
      const search='    defaultConfig {';
      if(!mod.modResults.contents.includes(search)) throw new Error('Configuração nativa Android não encontrada.');
      mod.modResults.contents=mod.modResults.contents.replace(search,`${search}\n        externalNativeBuild { cmake { arguments "${marker}" } }`);
    }
    return mod;
  });
  return withDangerousMod(config,['android',async mod=>{
    const file=path.join(mod.modRequest.projectRoot,'node_modules','expo-sqlite','android','CMakeLists.txt');
    const text=fs.readFileSync(file,'utf8');
    const marker='set(CMAKE_OBJECT_PATH_MAX 128)';
    if(!text.includes(marker)) {
      if(!text.includes('project(expo-sqlite)')) throw new Error('Configuração nativa do SQLite não encontrada.');
      fs.writeFileSync(file,text.replace('project(expo-sqlite)','project(expo-sqlite)\nif(CMAKE_HOST_WIN32)\n  set(CMAKE_OBJECT_PATH_MAX 128)\nendif()'));
    }
    return mod;
  }]);
};

