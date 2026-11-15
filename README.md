# Cartas-editor

Módulo para **Foundry VTT v13** que monta **cartas-token**: uma moldura de carta com a imagem do personagem dentro. O mestre escolhe um modelo, põe a imagem, ajusta o enquadramento e salva. A carta pronta vira o retrato e o token de um jogador, NPC ou criatura.

**Só o mestre vê e usa o módulo.** Os jogadores não ganham nenhum botão; eles só veem as imagens prontas nos atores e tokens.

## Como abrir (mestre)

- Botão **Cartas-editor** no topo da aba Atores.
- Botão **Cartas-editor** nos controles de Token (barra da esquerda).
- Botão direito num ator › **Criar carta-token**: abre uma carta com o retrato e o nome do ator, já ligada a ele. Se o ator já tem carta salva, abre essa carta.
- Configurações do módulo › **Abrir o Cartas-editor**.
- Atalho de teclado (sem tecla padrão; defina em Configurar Controles).
- Macro: `game.modules.get("cartas-editor").api.open()`.

## Modelos

**Seus modelos** (a área da imagem é a cor chapada do PNG):
- **Jogadores**: área azul.
- **NPC**: área rosa.
- **Inimigo**: área rosa.

A imagem entra só onde está a cor e fica **por trás** da moldura: os ornamentos que invadem a área colorida continuam por cima. As bordas são recortadas sem deixar franja rosa ou azul. Em **Cores do modelo** dá para mudar o tom da moldura inteira (matiz, saturação e brilho).

**Importar modelo (cor chapada)…**: para usar outro modelo feito no Photoshop ou noutro editor, pinte a área da imagem de uma cor viva e chapada e salve em PNG. O editor acha a cor sozinho. Se errar, clique na prévia para pegar a cor com o conta-gotas e ajuste a tolerância. O xadrez mostra onde a imagem vai entrar.

**Modelos do módulo** (13 molduras desenhadas pelo módulo, todas editáveis):
- Relíquia dourada, Herói radiante, Realeza, Guardião da floresta, Arcano, Gelo eterno, Carta de baralho, Vilão de obsidiana, Fera selvagem, Ossário, Quadro de ferro.
- **Medalhão** e **Medalhão sombrio**: cartas redondas, próprias para token.

Em cada uma dá para trocar:
- o formato da carta: em pé, quadrada ou redonda;
- a janela: arco, cápsula, retângulo, ogiva gótica, oval, escudo, cartucho barroco, octógono, hexágono ou círculo;
- o metal: ouro, prata, bronze, ouro rosé, obsidiana, ferro, jade, rubi, safira, ametista, osso, madeira, gelo ou uma cor própria;
- os ornamentos: volutas e folhas, joias e cravos, espinhos e chifres, runas brilhantes, louros e laço, estrelas e lua, cantoneiras de metal ou nenhum. O tamanho dos ornamentos é ajustável;
- as cores das folhas e das joias;
- a espessura da borda, a margem, a moldura dupla e o filete na beirada;
- o fundo: pergaminho, cor lisa, degradê, céu estrelado, pedra, madeira, mármore, tecido adamascado, losangos, raios de sol ou transparente, com duas cores, beiradas escurecidas e uma "variação" que sorteia outro desenho.

**Salvar como modelo** guarda a moldura editada na galeria.

## Pôr e ajustar a imagem

- **Arraste uma imagem** para a carta. Pode ser um arquivo do computador, um ator, um item ou uma imagem do Foundry.
- Também dá para usar os botões **Escolher no servidor** e **Enviar do computador**, ou colar uma imagem com **Ctrl+V**.
- O botão **Pegar o retrato de um ator…** usa o retrato e liga a carta a esse ator.
- Imagens vindas do computador ou coladas são enviadas para `<pasta>/originais`.

**Mover dentro da borda:**
- Arraste com o mouse para mover.
- Roda do mouse: zoom no ponto do cursor (Alt + roda dá zoom fino).
- Shift + roda: girar.
- Setas: 1 px por toque (com Shift, 10 px).
- `+` e `−`: zoom. `[` e `]`: giro de 1° (com Shift, 15°). `0` ou duplo clique: preencher a janela.
- Botões: Preencher, Inteira (a imagem toda dentro), Centralizar, Espelhar e girar 15°.
- O botão do fantasminha mostra a parte da imagem que fica fora da moldura. Ela também aparece enquanto você arrasta.
- Ctrl+Z desfaz e Ctrl+Y refaz.

**Painel Imagem**: zoom, giro, posição horizontal e vertical, espelhar, brilho, contraste e saturação.

**Fundo atrás da imagem**: transparente, cor ou degradê. Aparece onde a imagem não cobre a janela, como em imagens com fundo transparente. A sombra interna escurece a beirada da janela.

**Nome na carta** (opcional): texto (por padrão, o nome da carta), fonte, tamanho, cor, contorno, maiúsculas, negrito e faixa (fita ou placa). Arraste o nome na carta para posicioná-lo.

## Salvar e usar

- **Salvar carta**: gera a imagem e a envia para `worlds/<mundo>/cartas-editor/<jogadores|npcs|criaturas>/`. A carta fica em **Cartas salvas** para editar de novo depois.
  - Cada salvamento cria um arquivo novo (`nome-xxxx.webp`), assim o navegador não mostra a versão antiga do cache.
  - Os arquivos antigos ficam na pasta e podem ser apagados à mão.
- **Salvar e usar…** oferece três opções:
  - **Novo ator**: escolha nome, tipo, pasta (por padrão `Cartas-editor › Jogadores/NPCs/Criaturas`) e dono. Jogador sai aliado e com token vinculado; NPC sai neutro; criatura sai hostil.
  - **Ator existente**: troca o retrato e/ou o token. Opcionalmente troca também os tokens dele na cena atual.
  - **Tokens selecionados**: troca só a imagem dos tokens marcados na cena.
  - Nos três casos, o retrato pode ser a carta, a imagem original ou ficar como estava. O token pode ficar **1 × 1 com a carta inteira** (padrão) ou **em pé**: 1 de largura e a altura da carta.
- **Baixar** (ícone de seta): salva a imagem no computador, sem enviar ao servidor.
- **Resolução**: ×0,5 a ×4. Os seus modelos saem no tamanho original (448 × 750); as molduras do módulo saem em ×2 (900 × 1500).
- **Formato**: WebP (padrão, mais leve) ou PNG, por carta ou para o mundo inteiro (Configurações do módulo).

A carta aberta fica guardada como rascunho neste navegador: fechar a janela não perde nada.

## Configurações (mundo)

- **Pasta das cartas**: vazio = `worlds/<este mundo>/cartas-editor`. Também dá para mudar pelo painel Arquivo do editor.
- **Formato das imagens**: WebP ou PNG.

## API

```js
const api = game.modules.get("cartas-editor").api;
api.open();                          // abre o editor
api.open({ actor: game.actors.getName("Lorde Sombrio") }); // carta desse ator
api.open({ image: "caminho/da/imagem.webp" });
api.edit("Lorde Sombrio");           // abre uma carta salva (id ou nome)
api.cards();                         // cópias das cartas salvas
api.templates();                     // modelos disponíveis
```

## Observações

- Feito e testado num ambiente que simula o Foundry v13 (não num Foundry real). Se algo falhar, comece por: envio de arquivos (`FilePicker.upload`/`createDirectory`), o seletor de arquivos e de pastas, e o menu de botão direito dos atores.
- Hospedagens com armazenamento próprio (The Forge, S3) não foram testadas; o módulo envia para a fonte `data`.
- Imagens de outros sites podem ser bloqueadas pelo navegador na hora de salvar. Nesse caso, baixe a imagem e arraste o arquivo para o editor.

## Licença

Código sob licença MIT (veja `LICENSE`). Os três modelos em `assets/templates` (Jogadores, NPC e Inimigo) são arte do autor do módulo.
