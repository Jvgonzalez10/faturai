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

    // A MÁGICA ESTÁ AQUI: Regex que entende o texto "colado" gerado pelo pdf-parse
    // Ex: "03/08BILLY THE GRILLRIO DE J12,00"
    // 1. ^(\d{2}\/\d{2})   -> Pega os 5 primeiros caracteres (Data: 03/08)
    // 2. (.*?)             -> Pega tudo que estiver no meio (Nome: BILLY THE GRILLRIO DE J)
    // 3. (-?[\d\.]+\,\d{2})$ -> Pega o número no final da linha (Valor: 12,00)
    const regexLinhaColada = /^(\d{2}\/\d{2})(.*?)(-?[\d\.]+\,\d{2})$/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineUpper = line.toUpperCase();

      // 1. ATIVA A LEITURA
      if (
        lineUpper.includes('LANÇAMENTOS: COMPRAS E SAQUES') ||
        lineUpper.includes('LANCAMENTOS: COMPRAS E SAQUES') ||
        lineUpper.includes('LANÇAMENTOS: PRODUTOS E SERVIÇOS')
      ) {
        dentroDoExtrato = true;
        continue;
      }

      // 2. DESATIVA A LEITURA (Fim da seção de compras)
      if (
        lineUpper.includes('COMPRAS PARCELADAS') ||
        lineUpper.includes('LIMITES DE CRÉDITO') ||
        lineUpper.includes('ENCARGOS COBRADOS')
      ) {
        dentroDoExtrato = false;
      }

      if (!dentroDoExtrato) continue;

      // 3. IGNORA CATEGORIAS E CABEÇALHOS (Limpeza de linhas inúteis)
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
        lineUpper.startsWith('DATAESTABELECIMENTO') || // O cabeçalho da tabela também vem colado!
        lineUpper.includes('PAGAMENTO VIA CONTA') ||
        lineUpper.includes('TOTAL DOS PAGAMENTOS')
      ) {
        continue;
      }

      // 4. EXTRAÇÃO DOS DADOS
      const match = line.match(regexLinhaColada);

      if (match) {
        const data = match[1];
        let desc = match[2].trim();
        const valorStr = match[3];

        if (desc.length < 2) continue;

        const isNegative = valorStr.includes('-');
        let cleanVal = valorStr.replace('-', '').replace(/\./g, '').replace(',', '.').trim();
        let valor = parseFloat(cleanVal);

        if (!isNaN(valor) && valor > 0 && valor < 50000) {
          if (isNegative) valor = -Math.abs(valor);

          transacaoLista.push({
            data,
            descricao: desc, // Ex: "SHOPEE *AMCasu 05/06"
            valor,           // Ex: 62.77
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
