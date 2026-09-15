import { NextResponse } from 'next/server';
import pdfParse from 'pdf-parse';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const pdfData = await pdfParse(buffer);
    const text = pdfData.text;

    const lines = text.split('\n');
    const transacoes: Array<{ data: string; descricao: string; valor: number }> = [];

    // Captura padrão de linhas de fatura de cartão (data, estabelecimento e valor)
    const regexTransacao = /(\d{2}\/\d{2})\s+(.+?)\s+R?\$?\s*([\d\.,]+)/i;

    for (const line of lines) {
      const match = line.match(regexTransacao);
      if (match) {
        const [_, data, descricao, valorStr] = match;
        const valorClean = valorStr.replace('.', '').replace(',', '.');
        const valor = parseFloat(valorClean);

        if (!isNaN(valor) && valor > 0) {
          transacoes.push({
            data,
            descricao: descricao.trim(),
            valor,
          });
        }
      }
    }

    return NextResponse.json({ success: true, count: transacoes.length, dados: transacoes });
  } catch (error) {
    return NextResponse.json({ error: 'Erro ao processar o arquivo da fatura' }, { status: 500 });
  }
}