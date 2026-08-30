# CONCILIAÇÃO BANCÁRIA OFX — o extrato conversando com o caixa

**R$ 99/mês** como adicional, e **já incluído no Enterprise**.

> **Sobre o nome.** O material oficial de planos traz "CFX"; o produto que existe hoje é **OFX**, confirmado pelo Julyan em 29/08/2026. OFX é o formato padrão de arquivo de extrato bancário — é isso que o módulo lê.

## Leia isto antes de entrar na mesa: o nosso próprio site se contradiz

Duas páginas nossas dizem coisas diferentes, e o cliente que pesquisou vai te confrontar com a errada.

* A página **`/conciliacao-bancaria`** (a nova, indexada) diz o que é verdade: **você importa o arquivo OFX do Internet Banking, sem integração e sem credencial bancária dentro do sistema**.
* As páginas **`/solucoes`** e **`/solucoes/controle-financeiro-dre`** dizem "Conciliação bancária automática **(Open Finance)**" e chegam a nomear bancos — "Itaú, Bradesco, Santander, Sicredi e mais… **sem você precisar exportar OFX**". O FAQ dessa mesma página ainda diz "via Open Finance **ou** import OFX".

**O que existe hoje é o OFX.** Se o dono disser *"no site diz que conecta o banco automaticamente"*, a resposta honesta é: **hoje é importação de arquivo OFX, e isso é uma vantagem, não uma limitação** — porque **não pedimos a senha do banco dele**. Nenhuma credencial bancária entra no sistema. Muito dono trava exatamente nesse ponto com os concorrentes de Open Finance.

Não prometa conexão automática. E leve a divergência para o marketing corrigir — é a segunda vez que uma página desatualizada custa credibilidade em campo.

## A dor do dono

Ele tem um controle financeiro — no sistema, na planilha, ou na cabeça — e tem um extrato bancário. **Os dois nunca se olham.**

O resultado é o mês que "não fecha": o saldo do banco não bate com o que o controle diz, e ninguém sabe onde está a diferença. Aí vem a arqueologia: abrir o extrato, abrir o financeiro, comparar linha por linha à mão.

Na prática, quase ninguém faz isso. E o que não é conferido não é corrigido.

## Como funciona

O dono **exporta o OFX do Internet Banking** e importa. O módulo **cruza com os lançamentos do controle financeiro** — contas a pagar e a receber — e o cruzamento considera o que é específico de restaurante: **taxa de maquininha, repasse de delivery e prazo do PIX**. É isso que faz o valor do extrato não bater com o valor da venda, e é isso que a planilha não sabe tratar.

Cada linha do extrato cai em **um de três estados**, e vale saber os nomes:

| Estado | O que significa |
| --- | --- |
| **Semelhante** | achou o lançamento correspondente — é só confirmar |
| **Não encontrado** | entrou ou saiu do banco e **não existe no sistema** (etiqueta vermelha) |
| **Unificar e Conciliar** | vários lançamentos correspondem a um crédito só (o repasse de um dia inteiro, por exemplo) |

O **"Não encontrado" em vermelho é o produto**. É a linha que ninguém teria achado: pagamento em duplicidade, débito automático esquecido, taxa lançada errada, recebimento que não entrou.

## O Calendário Financeiro

Junto vem a visão que o dono mais usa depois: **saldo realizado dia a dia**, com os **pendentes em laranja** e o **saldo previsto**. Ele deixa de perguntar "quanto eu tenho?" e passa a ver "quanto eu vou ter na sexta" — que é a pergunta que decide se ele compra o insumo hoje.

## Os três hábitos que destravam o match

Isto é **conversa de implantação, e dizê-la na venda te protege**. A conciliação só funciona bem se:

1. os **lançamentos estiverem vinculados à conta** certa;
2. as **contas estiverem ativas e atualizadas**;
3. os **métodos de recebimento estiverem parametrizados** (maquininha, delivery, PIX).

Se o dono tem hoje um financeiro largado, diga que a primeira conciliação vai apontar muita coisa — **isso é o esperado, não é defeito**. Prometer match perfeito no primeiro mês para uma casa desorganizada é criar um churn.

## A frase que a casa usa

> **"Conciliar não é burocracia. É auditoria."**

Serve bem na mesa com dono que acha que conciliação é coisa de contador: auditoria é o que ele faz no estoque quando desconfia que está faltando. Isto é a mesma coisa, com o dinheiro.

## O que a concorrência faz

Nos PDVs comuns, o financeiro é uma **ilha**: registra o que alguém digita e nunca confere com o banco. A conciliação, quando existe, é do contador — que olha depois do mês fechado, quando já não dá para contestar nada, e olha para fins fiscais, não para gestão.

No comparativo público, **conciliação bancária** aparece como **"a verificar"** na maioria dos concorrentes de delivery — ou seja, não é sequer confirmável publicamente que eles tenham.

A alternativa real do pequeno é **conferir à mão** ou **não conferir**. E a segunda é a mais comum.

## O número que muda

**O tempo do fechamento, e a confiança no próprio número.** O dono deixa de fechar o mês por aproximação.

> **O que ainda não temos:** caso medido de quanto isso recupera em reais nem de quantas horas economiza. **Não prometa número.** Pergunte quanto tempo ele leva para fechar o mês hoje, e se o saldo do banco bate com o controle — as duas respostas já são o argumento.

## Pergunta de campo

*"Quando você fecha o mês, o saldo do banco bate com o que o seu controle diz?"*

Se a resposta tiver "mais ou menos", "quase" ou um silêncio, o módulo está vendido. E se ele responder *"quem cuida disso é o contador"*, a pergunta seguinte é: **"ele te avisa no dia 3 ou no dia 30?"**

**Sinal de venda:** dono com mais de uma conta bancária, ou que mistura conta PJ e pessoal, tem divergência garantida — e sabe que tem.

**Atenção comercial:** no **Enterprise já vem incluído**. Oferecer como adicional a quem está em Enterprise é cobrar por algo que ele já tem — a aba Propostas marca como "incluído" justamente para isso não acontecer.

*Fonte: página pública `takeat.app/conciliacao-bancaria`, conferida em 29/08/2026. A divergência com `/solucoes` e `/solucoes/controle-financeiro-dre` foi conferida nas mesmas páginas, na mesma data.*

Aprofundar: [Gestão Financeira — a guerra do controle gerencial](playbook:ecossistema-takeat#ecossistema-takeat-gestao-financeira-a-guerra-do-controle-gerencial) · [Catálogo de soluções](playbook:catalogo-solucoes) · [Mapa dor → solução](playbook:mapa-dor-solucao)

***

## O que fazer agora

- Pergunte quanto tempo o financeiro dele gasta para fechar o mês. Se a resposta vier em dias, você tem venda.
- Diga na primeira frase que a Takeat **não pede senha de banco** — é a objeção que mata essa conversa antes de começar.
- Mostre os três estados do match. O que vende não é importar o extrato, é o mês parar de fechar por aproximação.
