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

    // Captura separadamente: Data (DD/MM) + Descrição + Parcela opcional (DD/DD) + Valor final
    const regexLinhaComParcela = /^(\d{2}\/\d{2})(.*?)(?:(\d{2}\/\d{2}))?\s*(-?\s*[\d\.]+\,\d{2})$/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineUpper = line.toUpperCase();

      // 1. ATIVA LEITURA
      if (
        lineUpper.includes('LANÇAMENTOS: COMPRAS E SAQUES') ||
        lineUpper.includes('LANCAMENTOS: COMPRAS E SAQUES') ||
        lineUpper.includes('LANÇAMENTOS: PRODUTOS E SERVIÇOS')
      ) {
        dentroDoExtrato = true;
        continue;
      }

      // 2. DESATIVA LEITURA (Ignora parcelamentos futuros, limites e resumos)
      if (
        lineUpper.includes('COMPRAS PARCELADAS') ||
        lineUpper.includes('LIMITES DE CRÉDITO') ||
        lineUpper.includes('ENCARGOS COBRADOS')
      ) {
        dentroDoExtrato = false;
      }

      if (!dentroDoExtrato) continue;

      // 3. FILTRA CABEÇALHOS, CATEGORIAS E REFINANCIAMENTOS
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
        lineUpper.includes('FINANCIAM') ||
        lineUpper.includes('FINANCIAMENTO') ||
        lineUpper.includes('PAGAMENTO VIA CONTA') ||
        lineUpper.includes('TOTAL DOS PAGAMENTOS')
      ) {
        continue;
      }

      // 4. EXTRAÇÃO PRECISA
      const match = line.match(regexLinhaComParcela);

      if (match) {
        const data = match[1];
        let desc = match[2].trim();
        const parcela = match[3]; // Isola a parcela (ex: 05/06) sem misturar com o valor
        const valorStr = match[4];

        if (desc.length < 2) continue;

        // Se houver indicador de parcela no nome, limpa
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
