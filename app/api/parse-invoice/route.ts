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

    let totalFaturaOficial = 0;
    let totalEncargos = 0;
    let dentroDoExtrato = false;

    // Regex para captura de lancamentos com parcelas isoladas
    const regexLinhaComParcela = /^(\d{2}\/\d{2})(.*?)(?:(\d{2}\/\d{2}))?\s*(-?\s*[\d\.]+\,\d{2})$/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineUpper = line.toUpperCase();

      // 1. CAPTURA DOS TOTALIZADORES DO CABEÇALHO DO ITAÚ
      if (lineUpper.includes('TOTAL DESTA FATURA') || lineUpper.includes('O TOTAL DA SUA FATURA É:')) {
        const matchVal = line.match(/([\d\.]+\,\d{2})/);
        if (matchVal) {
          totalFaturaOficial = parseFloat(matchVal[1].replace(/\./g, '').replace(',', '.'));
        }
      }

      if (lineUpper.includes('ENCARGOS (FINANCIAMENTO + MORATÓRIO)')) {
        const matchVal = line.match(/([\d\.]+\,\d{2})/);
        if (matchVal) {
          totalEncargos = parseFloat(matchVal[1].replace(/\./g, '').replace(',', '.'));
        }
      }

      // 2. CONTROLE DE ENTRADA E SAÍDA DO EXTRATO
      if (
        lineUpper.includes('LANÇAMENTOS: COMPRAS E SAQUES') ||
        lineUpper.includes('LANCAMENTOS: COMPRAS E SAQUES') ||
        lineUpper.includes('LANÇAMENTOS: PRODUTOS E SERVIÇOS')
      ) {
        dentroDoExtrato = true;
        continue;
      }

      if (
        lineUpper.includes('COMPRAS PARCELADAS') ||
        lineUpper.includes('LIMITES DE CRÉDITO') ||
        lineUpper.includes('ENCARGOS COBRADOS')
      ) {
        dentroDoExtrato = false;
      }

      if (!dentroDoExtrato) continue;

      // 3. FILTRA CABEÇALHOS E CATEGORIAS
      if (
        lineUpper.startsWith('TRANSPORTE') ||
        lineUpper.startsWith('RESTAURANTE') ||
        lineUpper.startsWith('SUPERMERCADO') ||
        lineUpper.startsWith('SAÚDE') ||
        lineUpper.startsWith('SAUDE') ||
        lineUpper.startsWith('EDUCACAO') ||
        lineUpper.startsWith('EDUCAÇÃO') ||
        lineUpper.startsWith('OUTROS') ||
        lineUpper.startsWith('LAZER') ||
        lineUpper.startsWith('SERVIÇOS') ||
        lineUpper.startsWith('SERVICOS') ||
        lineUpper.startsWith('CASA') ||
        lineUpper.startsWith('VESTUÁRIO') ||
        lineUpper.startsWith('VESTUARIO') ||
        lineUpper.startsWith('DATAESTABELECIMENTO') ||
        lineUpper.includes('PAGAMENTO VIA CONTA') ||
        lineUpper.includes('TOTAL DOS PAGAMENTOS')
      ) {
        continue;
      }

      // 4. EXTRAÇÃO DOS LANÇAMENTOS
      const match = line.match(regexLinhaComParcela);

      if (match) {
        const data = match[1];
        let desc = match[2].trim();
        const parcela = match[3];
        const valorStr = match[4];

        if (desc.length < 2) continue;

        if (parcela) {
          desc = `${desc} ${parcela}`.trim();
        }

        const isNegative = valorStr.includes('-');
        let cleanVal = valorStr.replace('-', '').replace(/\./g, '').replace(',', '.').trim();
        let valor = parseFloat(cleanVal);

        if (!isNaN(valor) && valor > 0 && valor < 50000) {
          if (isNegative) valor = -Math.abs(valor);

          transacaoLista.push({
            data,
            descricao: desc,
            valor,
          });
        }
      }
    }

    // Adiciona os encargos como um item financeiro caso existam
    if (totalEncargos > 0) {
      transacaoLista.push({
        data: '03/09',
        descricao: 'ENCARGOS (JUROS / MULTA / IOF)',
        valor: totalEncargos,
      });
    }

    const somaTotalCalculada = transacaoLista.reduce((acc, item) => acc + item.valor, 0);

    return NextResponse.json({
      success: true,
      totalFatura: totalFaturaOficial || somaTotalCalculada,
      totalEncargos,
      count: transacaoLista.length,
      dados: transacaoLista,
    });
  } catch (error) {
    console.error('Erro no processamento do PDF:', error);
    return NextResponse.json({ error: 'Erro interno ao processar a fatura.' }, { status: 500 });
  }
}
