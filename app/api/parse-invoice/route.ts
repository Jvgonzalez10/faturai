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

    // Regex para data (DD/MM) e valor monetario no final da linha
    const regexData = /^(\d{2}\/\d{2})/;
    const regexValor = /(-?\s*[\d\.]+\,\d{2}\s*-?)$/;

    let dentroDoExtrato = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineUpper = line.toUpperCase();

      // Ativa a captura apenas quando entra na secao de lancamento
      if (lineUpper.includes('LANÇAMENTO') || lineUpper.includes('LANCAMENTO') || lineUpper.includes('DETALHAMENTO')) {
        dentroDoExtrato = true;
      }

      // Trava de seguranca para ignorar resumos gerais e limites
      if (
        lineUpper.includes('PAGAMENTO VIA CONTA') ||
        lineUpper.includes('TOTAL DOS PAGAMENTOS') ||
        lineUpper.includes('PAGAMENTO EFETUADO') ||
        lineUpper.includes('RESUMO DA FATURA') ||
        lineUpper.includes('VENCIMENTO') ||
        lineUpper.includes('TOTAL DESTA FATURA') ||
        lineUpper.includes('SALDO ANTERIOR') ||
        lineUpper.includes('ESTABELECIMENTO') ||
        lineUpper.includes('PROXIMA FATURA') ||
        lineUpper.includes('SUBTOTAL') ||
        lineUpper.includes('ENCARGOS') ||
        lineUpper.includes('LIMITE DE CREDITO') ||
        lineUpper.includes('OPERAÇÕES DE CRÉDITO')
      ) {
        continue;
      }

      const matchData = line.match(regexData);
      const matchValor = line.match(regexValor);

      if (matchData && matchValor) {
        const data = matchData[1];
        const valorStr = matchValor[1];

        // Limpa a descricao removendo a data, o valor e o termo topaz
        let desc = line
          .replace(data, '')
          .replace(valorStr, '')
          .replace(/-topaz/gi, '')
          .replace(/topaz/gi, '')
          .replace(/R\$/g, '')
          .trim();

        // Evita capturar linhas de resumo longas ou titulos
        if (desc.toUpperCase().includes('VALOR') || desc.length < 2 || desc.length > 50) {
          continue;
        }

        const isNegative = valorStr.includes('-');
        let cleanVal = valorStr.replace('-', '').replace(/\./g, '').replace(',', '.').trim();
        let valor = parseFloat(cleanVal);

        // Descarta valores zerados ou extremamente discrepantes isolados
        if (!isNaN(valor) && valor > 0 && valor < 30000) {
          if (isNegative) {
            valor = -Math.abs(valor);
          }

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
