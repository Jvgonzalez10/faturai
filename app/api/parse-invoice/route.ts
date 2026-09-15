import { NextResponse } from 'next/server';
import pdfParse from 'pdf-parse';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const pdfData = await pdfParse(buffer);
    const text = pdfData.text || '';

    if (!text.trim()) {
      return NextResponse.json({ error: 'Nenhum texto foi encontrado no PDF.' }, { status: 400 });
    }

    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    const transacaoLista: Array<{ data: string; descricao: string; valor: number }> = [];

    let dentroDoExtrato = false;
    let ultimaDataEncontrada = '';

    const regexData = /(\d{2}\/\d{2})/;
    const regexValor = /(-?\s*[\d\.]+\,\d{2}\s*-?)$/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineUpper = line.toUpperCase();

      // 1. ÁREA DE INTERESSE: Ativa ao ler os cabecalhos de compras do Itau
      if (
        lineUpper.includes('LANÇAMENTOS: COMPRAS E SAQUES') ||
        lineUpper.includes('LANCAMENTOS: COMPRAS E SAQUES') ||
        lineUpper.includes('LANÇAMENTOS: PRODUTOS E SERVIÇOS')
      ) {
        dentroDoExtrato = true;
        continue;
      }

      // 2. CORTE ESTRITO: Interrompe a leitura ao chegar em secoes de resumos e parcelas futuras
      if (
        lineUpper.includes('COMPRAS PARCELADAS - PRÓXIMAS FATURAS') ||
        lineUpper.includes('COMPRAS PARCELADAS - PROXIMAS FATURAS') ||
        lineUpper.includes('LIMITES DE CRÉDITO') ||
        lineUpper.includes('LIMITES DE CREDITO') ||
        lineUpper.includes('ENCARGOS COBRADOS NESTA FATURA') ||
        lineUpper.includes('NOVO TETO DE JUROS DO CARTÃO') ||
        lineUpper.includes('AUTENTICAÇÃO MECÂNICA') ||
        lineUpper.includes('FICHA DE COMPENSAÇÃO')
      ) {
        dentroDoExtrato = false;
      }

      if (!dentroDoExtrato) {
        continue;
      }

      // 3. IGNORA PALAVRAS CHAVE INSTITUCIONAIS E TOTALIZADORES
      if (
        lineUpper.includes('PAGAMENTO VIA CONTA') ||
        lineUpper.includes('TOTAL DOS PAGAMENTOS') ||
        lineUpper.includes('TOTAL DOS LANÇAMENTOS ATUAIS') ||
        lineUpper.includes('LANÇAMENTOS NO CARTÃO') ||
        lineUpper.includes('LANÇAMENTOS PRODUTOS E SERVIÇOS') ||
        lineUpper.includes('ESTABELECIMENTO') ||
        lineUpper.includes('PRODUTOS/SERVIÇOS') ||
        lineUpper.includes('VALOR EM R$') ||
        lineUpper.includes('DATA')
      ) {
        continue;
      }

      // Captura e memoriza a data (mesmo se estiver sozinha na linha)
      const matchData = line.match(regexData);
      if (matchData) {
        ultimaDataEncontrada = matchData[1];
      }

      // Busca o valor no final da linha
      const matchValor = line.match(regexValor);

      if (matchValor && ultimaDataEncontrada) {
        const valorStr = matchValor[1];

        // Extrai e limpa a descricao do estabelecimento
        let desc = line
          .replace(regexData, '')
          .replace(valorStr, '')
          .replace(/-topaz/gi, '')
          .replace(/topaz/gi, '')
          .replace(/R\$/g, '')
          .trim();

        // Filtra linhas de categoria/subtextos da fatura
        const descLower = desc.toLowerCase();
        if (
          descLower.startsWith('transporte') ||
          descLower.startsWith('restaurante') ||
          descLower.startsWith('supermercado') ||
          descLower.startsWith('saúde') ||
          descLower.startsWith('educacao') ||
          descLower.startsWith('outros') ||
          descLower.startsWith('lazer') ||
          descLower.startsWith('serviços') ||
          descLower.startsWith('casa') ||
          descLower.startsWith('vestuário') ||
          descUpper.includes('PRINCIPAL (') ||
          descUpper.includes('JUROS (')
        ) {
          continue;
        }

        const isNegative = valorStr.includes('-');
        let cleanVal = valorStr.replace('-', '').replace(/\./g, '').replace(',', '.').trim();
        let valor = parseFloat(cleanVal);

        // Somente adiciona compras validas
        if (!isNaN(valor) && valor > 0 && valor < 5000) {
          if (isNegative) {
            valor = -Math.abs(valor);
          }

          transacaoLista.push({
            data: ultimaDataEncontrada,
            descricao: desc || 'Compra com cartão',
            valor,
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      count: transacaoLista.length,
      dados: transacaoLista,
    });
  } catch (error) {
    console.error('Erro no processamento do PDF:', error);
    return NextResponse.json({ error: 'Erro interno ao processar a fatura.' }, { status: 500 });
  }
}
