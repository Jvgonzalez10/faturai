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

    const buffer = Buffer.from(await file.arrayBuffer());
    const pdfData = await pdfParse(buffer);
    const text = pdfData.text || '';

    const lines = text.split(/\r?\n/).filter(Boolean);

    // Encontra onde começam os lançamentos
    const startIndex = lines.findIndex(l => 
      l.toUpperCase().includes('LANÇAMENTOS') || 
      l.toUpperCase().includes('LANCAMENTOS')
    );

    const inicio = Math.max(0, startIndex - 2);
    const fim = Math.min(lines.length, inicio + 60); // Pega 60 linhas da área de compras

    console.log("========== INÍCIO DO TEXTO BRUTO DO PDF ==========");
    console.log(lines.slice(inicio, fim).join('\n'));
    console.log("========== FIM DO TEXTO BRUTO DO PDF ==========");

    return NextResponse.json({ 
      error: 'Modo de depuração ativado. Olhe o terminal/console do seu servidor e copie o texto gerado.' 
    }, { status: 400 });

  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Erro ao processar.' }, { status: 500 });
  }
}
