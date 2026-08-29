# 🛣️ ROTA INTELIGENTE — o elo que falta no delivery próprio

**R$ 109/mês.** Terceiro adicional mais caro da tabela. Ele é o fecho de uma guerra que a gente já sabia lutar pela metade.

## A dor do dono

Ele tem delivery próprio — ou quer sair do marketplace — mas **o entregador decide a rota de cabeça**. O resultado é sempre o mesmo: entrega fria, cliente ligando para perguntar onde está o pedido, e **duas viagens para o mesmo bairro na mesma hora**.

E aí acontece o pior para nós: ele conclui que "delivery próprio não funciona" e volta a pagar taxa de marketplace, porque o iFood **entrega melhor** do que ele.

## Como funciona, com os números reais

O módulo **agrupa pedidos por proximidade e sequencia a rota** do entregador. Três regras são configuráveis pelo dono — e saber os valores de fábrica é o que te deixa responder na mesa sem chutar:

| Regra | Padrão | Teto |
| --- | --- | --- |
| Pedidos por rota | **4** | **9** |
| Raio de agrupamento | **1,5 km** | configurável |
| Distância máxima da rota | **10 km** | configurável |

O teto de **9 pedidos** não é arbitrário: é o limite de paradas que o **link do Google Maps aceita**. Isso é útil na mesa — quando o dono pergunta "e se eu quiser 15 numa rota?", a resposta é técnica e verificável, não é "não dá".

**Modo moto:** o trajeto é calculado **por rua**, não em linha reta. Há opção de **contar o retorno** ao restaurante na quilometragem.

## O detalhe que ganha ou perde a venda: não existe app para o motoboy

Diga isso **antes** de o dono perguntar. O entregador **não instala nada**: ele recebe o roteiro **no WhatsApp**, com um botão que abre a sequência no Google Maps.

Isso é força e é limite, e o executivo honesto apresenta os dois:

* **É força** porque motoboy não baixa app. Freela troca de restaurante toda semana; exigir instalação e login é onde os sistemas de logística morrem na prática.
* **É limite** porque não há rastreamento do motoboy em tempo real dentro do nosso sistema. Se o dono quer ver o ponto azul andando no mapa, **essa não é a nossa entrega** — e é melhor ele saber disso na mesa que no segundo dia.

## O que o dono vê no despacho

No momento de despachar, a tela dá: **paradas, quilometragem e total a receber** da rota. Por parada: **cliente, endereço, itens e valor** — ou a marcação de **"pago online"**, que é o que evita o motoboy cobrar duas vezes.

Depois, o painel acompanha **parada a parada** e a **rota fecha sozinha** quando a última é concluída.

**Regras de operação que valem confirmar na mesa:**

* Rota **inteligente ou manual** — o dono pode montar na mão quando quiser.
* Serve **motoboy próprio e freela**.
* **Uma rota ativa por vez** por entregador.
* **Retirada não entra na rota** (é balcão, não entrega).
* **Relatório por motoboy**, com data e hora.

## O que a concorrência faz

A maioria dos PDVs **termina no "pedido pronto"** — a logística fica no WhatsApp do entregador. Quem resolve isso são **apps de logística avulsos**: mais uma mensalidade, fora do caixa, sem falar com o estoque e sem aparecer no relatório de custo do pedido.

## O número que muda

Dois números, e os dois o dono sabe de cor:

1. **Entregas por hora do mesmo entregador** — agrupar significa menos km por pedido, com a mesma moto e o mesmo salário.
2. **Custo por entrega comparado à taxa de marketplace** que ele paga hoje. Essa conta é a venda inteira.

> **O que ainda não temos:** benchmark interno de km/pedido nem de entregas/hora **medido em cliente nosso**. Os números da tabela acima são de **configuração do produto** (o que o módulo faz), não de **resultado** (o quanto melhorou). **Não converta um no outro.** Peça o dele: quantas entregas por noite, quantos motoboys, quanto de taxa no último extrato — e a conta se faz na frente dele, com o número dele.

## Pergunta de campo

*"Quantas vezes por noite o mesmo motoboy passa duas vezes na mesma rua?"*

E a segunda, que qualifica de verdade: *"seu motoboy é seu ou é freela?"* — se a casa não tem moto própria e usa só motoboy de marketplace, **este adicional não se aplica**. Não force fora do perfil.

**Sinal de venda:** dono que reclama de entrega fria ou de cliente ligando atrás do pedido está descrevendo este módulo sem saber o nome dele.

*Fonte dos números de configuração: página pública `takeat.app/solucoes/roteirizacao`, conferida em 29/08/2026.*

Aprofundar: [Delivery Próprio — a guerra da taxa de marketplace](playbook:ecossistema-takeat#ecossistema-takeat-delivery-proprio-a-guerra-da-taxa-abusiva-de-marketplace) · [Mapa dor → solução](playbook:mapa-dor-solucao)
