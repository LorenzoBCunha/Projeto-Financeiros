const {withAppBuildGradle}=require('@expo/config-plugins');
module.exports = config => withAppBuildGradle(config, mod => {
  if (mod.modResults.language !== 'groovy') throw new Error('Gradle Groovy esperado.');
  let text=mod.modResults.contents;
  if (!text.includes('financeirosSigningProperties')) {
    const start='    signingConfigs {';
    if (!text.includes(start)) throw new Error('Configuração de assinatura não encontrada.');
    text=text.replace(start, `    def financeirosSigningProperties = new Properties()
    def financeirosSigningFile = rootProject.file('../signing/signing.properties')
    if (!financeirosSigningFile.exists()) throw new GradleException('Chave de assinatura local não encontrada.')
    financeirosSigningFile.withInputStream { financeirosSigningProperties.load(it) }
    signingConfigs {
        release {
            storeFile new File(financeirosSigningFile.parentFile, financeirosSigningProperties['storeFile'])
            storePassword financeirosSigningProperties['storePassword']
            keyAlias financeirosSigningProperties['keyAlias']
            keyPassword financeirosSigningProperties['keyPassword']
        }`);
    const old='signingConfig signingConfigs.debug';
    const from=text.indexOf('        release {',text.indexOf('    buildTypes {'));
    const pos=text.indexOf(old,from);
    if (from<0 || pos<0) throw new Error('Assinatura de release não encontrada.');
    text=text.slice(0,pos)+text.slice(pos).replace(old,'signingConfig signingConfigs.release');
  }
  mod.modResults.contents=text;
  return mod;
});
