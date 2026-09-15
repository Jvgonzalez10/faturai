import { NextResponse } from 'next/server';
import { extractText } from 'unpdf';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    // Extracao de texto compativel com o ambiente Serverless da Vercel
    const { text } = await extractText(buffer);
    const fullText = Array.isArray(text) ? text.join('\n') : text;

    if (!fullText || fullText.trim().length === 0) {
      return NextResponse.json({
        error: 'Nenhum texto foi encontrado no PDF. Verifique se o arquivo nao e uma imagem digitalizada.',
      }, { status: 400 });
    }

    const lines = fullText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    const transacoes: Array<{ data: string; descricao: string; valor: number }> = [];

    // Regex para datas (DD/MM ou DD/MM/AAAA)
    const regexData = /(\d{2}\/\d{2}(?:\/\d{2,4})?)/;
    
    // Regex para valores financeiros brasileiros (ex: 15,90 ou 1.250,00)
    const regexValor = /([\d\.]+\,\d{2})/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Ignora cabecalhos e totais de pagamentos de faturas anteriores
      if (
        line.includes('Pagamento via conta') ||
        line.includes('Total dos pagamentos') ||
        line.includes('PAGAMENTO EFETUADO') ||
        line.includes('RESUMO DA FATURA')
      ) {
        continue;
      }

      // 1. Tenta encontrar Data, Descricao e Valor na mesma linha
      const matchData = line.match(regexData);
      const matchValor = line.match(regexValor);

      if (matchData && matchValor) {
        const data = matchData[1];
        const valorStr = matchValor[1];

        // Extrai o que sobrou da linha como descricao
        let descricao = line
          .replace(data, '')
          .replace(valorStr, '')
          .replace(/R\$/g, '')
          .trim();

        // Se a descricao ficou vazia na mesma linha, busca na linha seguinte
        if (!descricao && lines[i + 1]) {
          descricao = lines[i + 1].trim();
        }

        const valorClean = valorStr.replace(/\./g, '').replace(',', '.');
        const valor = parseFloat(valorClean);

        if (!isNaN(valor) && valor > 0 && descricao.length > 1) {
          transacoes.push({
            data,
            descricao,
            valor,
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      count: transacoes.length,
      dados: transacoes,
    });
  } catch (error) {
    console.error('Erro no processamento do PDF:', error);
    return NextResponse.json(
      { error: 'Erro interno ao processar a fatura.' },
      { status: 500 }
    );
  }
}
