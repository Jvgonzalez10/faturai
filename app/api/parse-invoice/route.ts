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
    let dataAtual = '';
    let descBuffer: string[] = [];

    const regexData = /^(\d{2}\/\d{2})$/;
    const regexValor = /^(-?\s*[\d\.]+\,\d{2}\s*-?)$/;

    // Lista de categorias/termos do Itau para descartar na descricao
    const ignorarCategorias = [
      'TRANSPORTE', 'RESTAURANTE', 'SUPERMERCADO', 'SAÚDE', 'SAUDE',
      'EDUCACAO', 'EDUCAÇÃO', 'OUTROS', 'LAZER', 'SERVIÇOS', 'SERVICOS',
      'CASA', 'VESTUÁRIO', 'VESTUARIO', 'SUPERMARKET'
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineUpper = line.toUpperCase();

      // 1. ANCORA DE INICIO: Ativa a leitura ao encontrar os blocos de lancamentos do Itau
      if (
        lineUpper.includes('LANÇAMENTOS: COMPRAS E SAQUES') ||
        lineUpper.includes('LANCAMENTOS: COMPRAS E SAQUES') ||
        lineUpper.includes('LANÇAMENTOS: PRODUTOS E SERVIÇOS') ||
        lineUpper.includes('LANÇAMENTOS PRODUTOS E SERVIÇOS') ||
        lineUpper.includes('LANÇAMENTOS DO CARTÃO')
      ) {
        dentroDoExtrato = true;
        continue;
      }

      // 2. ANCORA DE FIM: Interrompe assim que chega nas parcelas futuras, limites ou boletos
      if (
        lineUpper.includes('COMPRAS PARCELADAS - PRÓXIMAS FATURAS') ||
        lineUpper.includes('COMPRAS PARCELADAS - PROXIMAS FATURAS') ||
        lineUpper.includes('LIMITES DE CRÉDITO') ||
        lineUpper.includes('LIMITES DE CREDITO') ||
        lineUpper.includes('NOVO TETO DE JUROS') ||
        lineUpper.includes('AUTENTICAÇÃO MECÂNICA') ||
        lineUpper.includes('FICHA DE COMPENSAÇÃO')
      ) {
        dentroDoExtrato = false;
      }

      if (!dentroDoExtrato) continue;

      // 3. IGNORA REPETIÇÕES E CABEÇALHOS
      if (
        lineUpper.includes('PAGAMENTO VIA CONTA') ||
        lineUpper.includes('TOTAL DOS PAGAMENTOS') ||
        lineUpper.includes('TOTAL DOS LANÇAMENTOS ATUAIS') ||
        lineUpper.includes('ESTABELECIMENTO') ||
        lineUpper.includes('PRODUTOS/SERVIÇOS') ||
        lineUpper.includes('VALOR EM R$') ||
        lineUpper.includes('PRINCIPAL (') ||
        lineUpper.includes('JUROS (')
      ) {
        continue;
      }

      // CASO A: A linha é uma Data (DD/MM)
      if (regexData.test(line)) {
        dataAtual = line;
        descBuffer = [];
        continue;
      }

      // CASO B: A linha é um Valor Financeiro (ex: 189,72 ou 4.451,25)
      if (regexValor.test(line) && dataAtual) {
        const valorStr = line;
        const isNegative = valorStr.includes('-');
        let cleanVal = valorStr.replace('-', '').replace(/\./g, '').replace(',', '.').trim();
        let valor = parseFloat(cleanVal);

        // Monta a descricao juntando o buffer acumulado
        let desc = descBuffer.join(' ').trim();

        // Filtra sujeiras de categoria
        ignorarCategorias.forEach((cat) => {
          const reg = new RegExp(`\\b${cat}\\b`, 'gi');
          desc = desc.replace(reg, '');
        });

        desc = desc.replace(/R\$/g, '').trim();

        if (!isNaN(valor) && valor > 0 && valor < 5000) {
          if (isNegative) valor = -Math.abs(valor);

          transacaoLista.push({
            data: dataAtual,
            descricao: desc || 'Compra com cartão',
            valor,
          });
        }

        // Limpa o estado para a proxima transacao
        descBuffer = [];
        continue;
      }

      // CASO C: A linha é o nome do estabelecimento ou texto intermediario
      if (dataAtual && !ignorarCategorias.includes(lineUpper)) {
        // Se a linha for apenas uma categoria isolada (ex: "supermercado RIO DE JANEIR"), ignora
        let ehCategoriaIsolada = false;
        for (const cat of ignorarCategorias) {
          if (lineUpper.startsWith(cat)) {
            ehCategoriaIsolada = true;
            break;
          }
        }

        if (!ehCategoriaIsolada) {
          descBuffer.push(line);
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
