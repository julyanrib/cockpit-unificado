# 🏦 CONCILIAÇÃO BANCÁRIA OFX — o extrato conversando com o caixa

**R$ 99/mês** como adicional, e **já incluído no Enterprise**. Até 29/08/2026 aparecia 3 vezes em todo o playbook, sem nenhum argumento de campo.

> **Sobre o nome.** O material oficial de planos traz "CFX"; o produto que existe hoje é **OFX**, confirmado pelo Julyan em 29/08/2026. OFX é o formato de arquivo padrão de extrato bancário — é isso que o módulo lê. Se alguém te mostrar a peça com "CFX", é a mesma coisa.

## A dor do dono

Ele tem um controle financeiro — no sistema, na planilha, ou na cabeça — e tem um extrato bancário. **Os dois nunca se olham.**

O resultado é o mês que "não fecha": o saldo do banco não bate com o que o controle diz que deveria ter, e ninguém sabe onde está a diferença. Aí vem a arqueologia: abrir o extrato, abrir o financeiro, e comparar linha por linha, à mão, procurando o que sobrou ou o que faltou.

Na prática, quase ninguém faz isso. E o que não é conferido não é corrigido.

## Como funciona

O módulo **importa o extrato bancário em arquivo OFX** — o formato que todo banco exporta — e **cruza automaticamente com os lançamentos do controle financeiro**: contas a pagar e contas a receber.

O que era comparação manual vira **divergência apontada**:

- pagamento que saiu da conta e não está lançado;
- lançamento que existe no sistema e não saiu da conta;
- valor que saiu diferente do que foi previsto;
- recebimento que o controle esperava e o banco não registrou.

Em uma frase para a mesa do dono: **o extrato e o caixa param de ser dois documentos que ninguém compara.**

## O que a concorrência faz

Nos PDVs comuns, o financeiro é uma **ilha**: ele registra o que alguém digita e nunca confere com o banco. A conciliação, quando existe, é responsabilidade do contador — que olha depois do mês fechado, quando já não dá para contestar nada, e olha para fins fiscais, não para gestão.

A alternativa real do pequeno é **conferir à mão** ou **não conferir**. E a segunda é a mais comum.

## O número que muda

**O tempo do fechamento, e a confiança no próprio número.**

O dono deixa de fechar o mês por aproximação. E é aí que aparece o que estava escondido: pagamento em duplicidade, débito automático que ninguém lembrava, taxa lançada errada, receita que não entrou.

> **Lacuna declarada:** não temos caso medido de quanto isso recupera em reais nem de quantas horas economiza. **Não prometa número.** Pergunte quanto tempo ele leva para fechar o mês hoje, e se o saldo do banco bate com o controle dele — as duas respostas já são o argumento.

## Pergunta de campo

*"Quando você fecha o mês, o saldo do banco bate com o que o seu controle diz?"*

Se a resposta tiver "mais ou menos", "quase" ou um silêncio, o módulo está vendido. E se ele responder *"quem cuida disso é o contador"*, a pergunta seguinte é: **"ele te avisa no dia 3 ou no dia 30?"**

**Sinal de venda:** dono que tem mais de uma conta bancária, ou que usa conta PJ e pessoal misturadas, tem divergência garantida — e sabe que tem.

**Atenção comercial:** no **Enterprise já vem incluído**. Oferecer como adicional a quem está em Enterprise é cobrar por algo que ele já tem — a aba Propostas marca como "incluído" justamente para isso não acontecer.

Aprofundar: [Gestão Financeira — a guerra do controle gerencial](playbook:ecossistema-takeat#ecossistema-takeat-gestao-financeira-a-guerra-do-controle-gerencial) · [Catálogo de soluções](playbook:catalogo-solucoes) · [Mapa dor → solução](playbook:mapa-dor-solucao)
