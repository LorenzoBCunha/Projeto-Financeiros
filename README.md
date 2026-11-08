# Financeiros

Aplicativo Android pessoal, sem conta e com dados locais. No primeiro acesso, informe seu nome e salário e, se quiser, cadastre despesas fixas e metas. Em uma instalação anterior, o nome é solicitado sem refazer o planejamento. O nome pode ser alterado em Configurações. O banco usa SQLCipher; a chave fica protegida pelo SecureStore e pelo método de acesso escolhido: PIN ou biometria. O outro método pode ser ativado em Configurações → Segurança. Em uma instalação antiga, a biometria anterior é solicitada durante a migração para preservar o acesso existente. Faça backups criptografados e teste a restauração antes de confiar dados importantes ao aplicativo.

## Testes e build local

Requer Node.js, JDK 21 e Android SDK. Na pasta do projeto:

```powershell
npm install
npm test
npx tsc --noEmit
npx expo prebuild --platform android --no-install
$env:ANDROID_HOME = 'C:\Users\Phoen\Documents\Codex\2026-11-06\aca\work\android-sdk'
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
Set-Location android
.\gradlew.bat assembleRelease
```

O APK fica em `android\app\build\outputs\apk\release\app-release.apk`. A pasta `signing` contém a chave privada e a senha de assinatura: mantenha uma cópia segura e privada. Ela é necessária para instalar futuras atualizações sobre esta instalação. Não compartilhe essa pasta.

No computador configurado nesta instalação, o ADB está em `C:\Users\Phoen\Documents\Codex\2026-11-06\aca\work\android-tools\platform-tools\adb.exe`:

```powershell
$adb = 'C:\Users\Phoen\Documents\Codex\2026-11-06\aca\work\android-tools\platform-tools\adb.exe'
& $adb devices
& $adb install -r 'C:\financas-app\android\app\build\outputs\apk\release\app-release.apk'
& $adb shell am start -n br.com.financeiros.pessoal/.MainActivity
```

Para depurar manualmente, filtre o log pelo processo do pacote e não inclua dados financeiros ou senhas em relatos de erro:

```powershell
$financeirosPid = (& $adb shell pidof br.com.financeiros.pessoal).Trim()
& $adb logcat --pid=$financeirosPid
```

## Análise financeira e correções

Em **Mês → Análise financeira**, confira gastos por categoria, compare com o mês anterior, cadastre limites mensais e busque por local, categoria, cartão ou forma de pagamento e filtre por datas dentro do mês selecionado. Os limites indicam visualmente quando chegam a 80% ou 100% e podem gerar avisos locais com a permissão de notificações. O cálculo por categoria usa a data da compra e não soma o pagamento da fatura novamente. A simulação da reserva usa valores informados manualmente e não altera as caixinhas.

Em um mês aberto, toque em um gasto comum ou entrada para editar ou excluir. Compras de cartão podem ser corrigidas antes de qualquer pagamento das faturas envolvidas; pagamentos vinculados permanecem protegidos. Meses fechados permanecem protegidos.

O valor **Orçamento livre estimado** é um cálculo do planejamento; não representa o saldo bancário e não desconta faturas ou dívidas ainda não pagas. Na tela **Backup**, é possível verificar um arquivo e sua senha sem restaurá-lo. A data do backup é registrada somente após você confirmar que salvou o arquivo.

## Extrato para compartilhar

Na aba **Mês**, toque em **Compartilhar extrato**, marque os lançamentos desejados e gere o texto. Revise ou edite antes de tocar em **Compartilhar no WhatsApp** e escolher um contato. O mesmo botão aparece no resumo após a virada; nenhum lançamento é selecionado automaticamente.

## Saldo e compromissos

Em **Mês → Saldo e compromissos**, informe o total atual das contas e o valor reservado que não corresponde às dívidas cadastradas. O app desconta dívidas, faturas e despesas fixas que forem marcadas como previstas em Contas e salário. Revise as despesas sem situação; não cadastre a mesma conta também em Devo, para evitar contá-la duas vezes. Este saldo é informado manualmente e precisa ser atualizado depois de movimentações e em outro dia. Não existe sincronização bancária.

Para pagar parte de uma fatura, abra **Devo → Pagar** e informe um valor menor. O restante continua em aberto. Pagamentos parciais são distribuídos proporcionalmente entre as caixinhas associadas e os demais gastos.

## Cartões e fechamento do mês

Na configuração inicial, informe se usa cartões e cadastre o nome, o dia de fechamento, o dia de vencimento e a regra para compras no próprio dia do fechamento. Os cartões também podem ser configurados em **Configurações → Cartões**. Cada compra no crédito exige escolher o cartão e cria ou aumenta a dívida da fatura. A compra não desconta o dinheiro disponível até o pagamento da fatura. Em **Devo**, marque a fatura como paga e informe forma de pagamento e categoria. Confira a data com o banco; fins de semana ou feriados podem mudar o vencimento, que pode ser ajustado em **Devo**.

Compras no crédito registradas antes desta atualização precisam de revisão: escolha se já foram pagas ou informe o cartão e a data real da fatura. Não são alteradas automaticamente. Até a revisão, o valor livre não é exibido; uma virada de mês com compras sem revisão pode ficar pendente.

Ao fechar o mês, o app oferece criar um backup criptografado. Informe uma senha e escolha o destino na tela de compartilhamento do Android, por exemplo o Google Drive quando estiver disponível. O arquivo só é enviado ou salvo ao escolher uma opção nessa tela. Destinos iCloud dependem de haver uma opção compatível no aparelho; não há integração direta com iCloud.

## Avisos e backup

No Android 13 ou superior, permita as notificações quando o aplicativo solicitar. Os avisos são locais e usam texto discreto por padrão; o nome e o valor só aparecem se a opção de detalhes estiver ativada. Os avisos são programados para as 9h do dia escolhido, sujeitos aos limites de bateria e de agendamento do Android.

Para bateria, abra **Configurações → Aplicativos → Financeiros → Bateria** e escolha **Sem restrições**, se disponível. Em aparelhos Xiaomi, procure também **Configurações → Aplicativos → Gerenciar aplicativos → Financeiros → Início automático** e ative-o; o nome e o caminho podem variar. Em Samsung, confira ainda **Configurações → Bateria → Limites de uso em segundo plano** e retire o Financeiros das listas de aplicativos em suspensão. Essas opções variam conforme a versão do Android e o fabricante.

Em **Backup**, use uma senha de pelo menos oito caracteres e salve o arquivo criptografado em local seguro. Para importar, escolha o arquivo e confirme a substituição. Alterações nas biometrias cadastradas podem invalidar a chave protegida; nesse caso, a tela de bloqueio oferece restauração de um backup para um banco separado, preservando o arquivo anterior. Sem a senha do backup, não é possível recuperar seu conteúdo.

Depois da instalação e dos testes, desligue a depuração USB. A biometria é opcional; para ativá-la, é necessário cadastrá-la no aparelho.

A navegação entre as abas usa uma transição breve, respeitando a opção de reduzir animações do aparelho. Configurações fica em uma tela própria, acessível pelo topo das abas.

## Estado da verificação

Os testes automatizados verificam cálculos, faturas e a restauração dos registros em um banco de teste. A exportação para o destino escolhido, a restauração no aparelho, os avisos e o bloqueio após 30 segundos em segundo plano precisam ser conferidos no próprio celular. Teste o backup e a restauração antes de depender deles para recuperar dados.

O Android inclui `DETECT_SCREEN_CAPTURE` porque o módulo de proteção de tela necessita dessa permissão para iniciar em versões recentes; ela não concede acesso às fotos do aparelho. O APK não solicita internet, contatos, localização nem acesso amplo aos arquivos.

## Contas e parcelamento

Em **Mês → Contas e salário**, informe o salário recebido e revise cada despesa fixa como prevista, paga ou dispensada, incluindo vencimento. O saldo continua informado manualmente. Despesas sem situação precisam de revisão. O resumo estimado continua disponível; a aba Ano também mostra separadamente salários informados e saídas confirmadas, indicando despesas fixas ainda sem situação.

Para registrar uma compra parcelada, informe o valor total, escolha Crédito, o cartão e o número de parcelas. Os centavos são distribuídos pelas faturas futuras; confira as faturas com o banco. Parcelamentos podem ser vinculados a caixinhas: cada parcela é considerada ao pagar sua fatura. O valor de uma compra pode ser corrigido enquanto nenhuma das faturas envolvidas tiver pagamento e a data continuar no mesmo ciclo.

## Segurança e acessibilidade

Na primeira entrada escolha PIN ou biometria. O PIN usa de 6 a 12 números; um segundo método pode ser cadastrado em Configurações → Segurança. Em uma instalação anterior, a biometria existente pode ser solicitada para preservar a chave original. A chave anterior permanece protegida. Após várias tentativas incorretas, há um período de espera. Para restaurar um backup a partir da tela de bloqueio, informe a senha do backup e crie um novo PIN; a restauração ocorre em um banco separado.

Em Configurações → Acessibilidade, escolha o tema claro ou escuro e o tamanho da fonte. Em Guia, consulte as telas do aplicativo; em Sobre, veja a versão, autoria, contato e Pix de doação.

Em Devo, a chave Pix é opcional e pode ser copiada ou editada. Em Metas, cadastre uma meta com prazo e aviso. Em Investimentos e bens, registre o custo e o valor atual informados manualmente, com lembrete opcional. O app não consulta cotações nem movimenta dinheiro; confirme a disponibilidade real do resgate com a instituição.

## Metas reais, recorrências e lembretes

Em Metas, abra a movimentação da meta e informe o saldo inicial real. Depois registre depósitos e retiradas; esses registros são manuais e não movimentam dinheiro no banco. Valores planejados anteriormente não são presumidos como depósitos.

Em Mês → Despesas recorrentes, cadastre contas mensais, trimestrais, semestrais ou anuais e crie cada ocorrência em Devo quando desejar acompanhá-la. Evite cadastrar uma mesma obrigação também como despesa fixa. As datas e os avisos devem ser conferidos com o prestador.

Em Backup, é possível ativar lembretes locais a cada 7 ou 30 dias. O prazo é reiniciado ao confirmar que salvou o arquivo; o lembrete não cria nem envia backups automaticamente.
