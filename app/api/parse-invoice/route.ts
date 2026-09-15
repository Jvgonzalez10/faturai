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
    let dentroProximasFaturas = false;

    // 1. CAPTURA DO TOTAL OFICIAL DA FATURA
    for (const line of lines) {
      const lineNorm = line.replace(/\s+/g, ' ').toUpperCase();
      if (lineNorm.includes('TOTAL DESTA FATURA') || lineNorm.includes('O TOTAL DA SUA FATURA')) {
        const matchVal = line.match(/([\d\.]+[,\.]\d{2})/);
        if (matchVal) {
          let rawVal = matchVal[1];
          if (rawVal.includes(',')) {
            rawVal = rawVal.replace(/\./g, '').replace(',', '.');
          } else {
            const parts = rawVal.split('.');
            if (parts.length > 2) {
              const dec = parts.pop();
              rawVal = parts.join('') + '.' + dec;
            }
          }
          const parsed = parseFloat(rawVal);
          if (!isNaN(parsed) && parsed > 0) {
            totalFaturaOficial = parsed;
            break;
          }
        }
      }
    }

    // 2. REGEX DE TRANSAÇÃO (Suporta valores positivos, negativos e parcelas)
    const regexTransacao = /^(\d{2}\/\d{2})\s*(.*?)(?:(\d{2}\/\d{2}))?\s*(-?\s*[\d\.]+[,\.]\d{2})$/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNorm = line.replace(/\s+/g, '').toUpperCase();

      // Ignora a seção de "Próximas Faturas" para não duplicar parcelas futuras
      if (
        lineNorm.includes('PRÓXIMASFATURAS') ||
        lineNorm.includes('PROXIMASFATURAS') ||
        lineNorm.includes('LIMITESDECRÉDITO') ||
        lineNorm.includes('ENCARGOSCOBRADOS')
      ) {
        dentroProximasFaturas = true;
      }

      if (
        lineNorm.includes('LANÇAMENTOS:') ||
        lineNorm.includes('LANCAMENTOS:') ||
        lineNorm.includes('LANÇAMENTOS')
      ) {
        dentroProximasFaturas = false;
      }

      if (dentroProximasFaturas) continue;

      // Filtra pagamentos efetuados e subtotais
      const lineUpper = line.toUpperCase();
      if (
        lineUpper.includes('PAGAMENTO VIA CONTA') ||
        lineUpper.includes('PAGAMENTO -') ||
        lineUpper.startsWith('PAGAMENTO') ||
        lineUpper.includes('TOTAL DOS PAGAMENTOS') ||
        lineUpper.includes('LANÇAMENTOS NO CARTÃO') ||
        lineUpper.includes('TOTAL DOS LANÇAMENTOS') ||
        lineUpper.startsWith('ESTABELECIMENTO')
      ) {
        continue;
      }

      const match = line.match(regexTransacao);

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

        if (!isNaN(valor) && valor !== 0 && Math.abs(valor) < 50000) {
          if (isNegative) valor = -Math.abs(valor);

          transacaoLista.push({
            data,
            descricao: desc,
            valor,
          });
        }
      }
    }

    const somaCalculada = transacaoLista.reduce((acc, item) => acc + item.valor, 0);

    return NextResponse.json({
      success: true,
      totalFatura: totalFaturaOficial || somaCalculada,
      count: transacaoLista.length,
      dados: transacaoLista,
    });
  } catch (error) {
    console.error('Erro no processamento do PDF:', error);
    return NextResponse.json({ error: 'Erro interno ao processar a fatura.' }, { status: 500 });
  }
}
