import { NextResponse } from 'next/server';
import pdfParse from 'pdf-parse';

export const runtime = 'nodejs';

// Converte valores monetários do PDF para float
function parseBrazilianCurrency(str: string): number {
  if (!str) return 0;
  let clean = str.replace(/R\$/gi, '').replace(/\s+/g, '').trim();
  const isNegative = clean.includes('-');
  clean = clean.replace('-', '');

  // Trata '4.955,25' -> '4955.25'
  if (/^\d{1,3}(\.\d{3})*,\d{2}$/.test(clean)) {
    clean = clean.replace(/\./g, '').replace(',', '.');
  } 
  // Trata '4.451.25' (ponto no lugar de vírgula)
  else if (/^\d{1,3}\.\d{3}\.\d{2}$/.test(clean)) {
    const parts = clean.split('.');
    clean = parts[0] + parts[1] + '.' + parts[2];
  }
  // Trata '4955,25'
  else if (/^\d+,\d{2}$/.test(clean)) {
    clean = clean.replace(',', '.');
  }

  const val = parseFloat(clean);
  if (isNaN(val)) return 0;
  return isNegative ? -Math.abs(val) : val;
}

// Captura o total oficial diretamente das seções de cabeçalho do Itaú
function extractOfficialTotal(text: string): number {
  // Padrão 1: "O total da sua fatura é: ... R$ 4.955,25" ou "R$ 4.451,25"
  const match1 = text.match(/O\s+total\s+da\s+sua\s+fatura[\s\S]{1,120}?R\$\s*([\d\.\,]{4,15})/i);
  if (match1) {
    const val = parseBrazilianCurrency(match1[1]);
    if (val > 10) return val;
  }

  // Padrão 2: "Total desta fatura | 4.955,25" / "4.451.25"
  const match2 = text.match(/Total\s+desta\s+fatura[\s\S]{1,60}?([\d\.\,]{4,15})/i);
  if (match2) {
    const val = parseBrazilianCurrency(match2[1]);
    if (val > 10) return val;
  }

  // Padrão 3: "Valor do Documento | R$ 4.955,25"
  const match3 = text.match(/Valor\s+do\s+Documento[\s\S]{1,40}?R\$\s*([\d\.\,]{4,15})/i);
  if (match3) {
    const val = parseBrazilianCurrency(match3[1]);
    if (val > 10) return val;
  }

  return 0;
}

// Extrai encargos da fatura (juros/multa/IOF) se existirem
function extractEncargos(text: string): number {
  const match = text.match(/Total\s+de\s+encargos\s+em\s+R\$[\s\S]{1,40}?([\d\.\,]{3,10})/i);
  if (match) {
    return parseBrazilianCurrency(match[1]);
  }
  return 0;
}

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

    const totalFaturaOficial = extractOfficialTotal(text);
    const totalEncargos = extractEncargos(text);

    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    const transacaoLista: Array<{ data: string; descricao: string; valor: number }> = [];

    let dentroPagamentos = false;
    let dentroProximasFaturas = false;

    // Regex de transações: Data (DD/MM) + Estabelecimento + Valor
    const regexTransacao = /^(\d{2}\/\d{2})\s+(.*?)\s+(-?\s*R\$\s*-?\s*[\d\.\,]+)$/;

    for (let i = 0; i < lines.length; i++) {
      const lineClean = lines[i].replace(/\|/g, ' ').replace(/\s+/g, ' ').trim();
      const lineCompacta = lineClean.replace(/\s+/g, '').toUpperCase();
      const lineUpper = lineClean.toUpperCase();

      // Ignora a seção "Pagamentos Efetuados" (quitação da fatura anterior)
      if (
        lineCompacta.includes('PAGAMEN') || 
        lineCompacta.includes('PAGAMENTOSEFETUADOS') ||
        lineUpper.includes('PAGAMENTOS EFETUADOS')
      ) {
        dentroPagamentos = true;
      }

      if (
        lineCompacta.includes('TOTALDOSPAGAMENTOS') || 
        lineCompacta.includes('LANÇAMENTOS:') || 
        lineCompacta.includes('LANCAMENTOS:') ||
        lineUpper.startsWith('LANÇAMENTOS')
      ) {
        dentroPagamentos = false;
      }

      if (dentroPagamentos) continue;

      // Ignora parcelas de faturas futuras e bloco de limites
      if (
        lineCompacta.includes('PRÓXIMASFATURAS') ||
        lineCompacta.includes('PROXIMASFATURAS') ||
        lineCompacta.includes('COMPRASPARCELADAS') ||
        lineCompacta.includes('LIMITESDECRÉDITO') ||
        lineCompacta.includes('ENCARGOSCOBRADOS')
      ) {
        dentroProximasFaturas = true;
      }

      if (
        lineCompacta.includes('LANÇAMENTOS:') || 
        lineCompacta.includes('LANCAMENTOS:')
      ) {
        dentroProximasFaturas = false;
      }

      if (dentroProximasFaturas) continue;

      // Filtra termos de cabeçalho e pagamentos
      if (
        lineUpper.includes('PAGAMENTO VIA CONTA') ||
        lineUpper.includes('TOTAL DOS PAGAMENTOS') ||
        lineUpper.includes('LANÇAMENTOS NO CARTÃO') ||
        lineUpper.includes('TOTAL DOS LANÇAMENTOS') ||
        lineUpper.includes('SUBTOTAL') ||
        lineUpper.startsWith('ESTABELECIMENTO') ||
        lineUpper.startsWith('PRODUTOS/SERVIÇOS') ||
        lineUpper.startsWith('PAGAMENTO') ||
        lineUpper.startsWith('DATA')
      ) {
        continue;
      }

      const match = lineClean.match(regexTransacao);

      if (match) {
        const data = match[1];
        let desc = match[2].trim();
        const valorStr = match[3];

        const descUpper = desc.toUpperCase();

        if (
          descUpper === 'PAGAMENTO' ||
          descUpper.startsWith('PAGAMENTO VIA') ||
          descUpper.startsWith('PAGAMENTO EFETUADO') ||
          descUpper.includes('TOTAL DOS PAGAMENTOS')
        ) {
          continue;
        }

        if (desc.length < 2) continue;

        const valor = parseBrazilianCurrency(valorStr);

        if (valor !== 0 && Math.abs(valor) < 50000) {
          transacaoLista.push({
            data,
            descricao: desc,
            valor,
          });
        }
      }
    }

    // Se houver encargos do rotativo informados no PDF (ex: R$ 130,19 na fatura 1), inclui como item real
    if (totalEncargos > 0) {
      transacaoLista.push({
        data: '03/09',
        descricao: 'ENCARGOS DA FATURA (JUROS / MULTA / IOF)',
        valor: totalEncargos,
      });
    }

    const somaCalculada = transacaoLista.reduce((acc, item) => acc + item.valor, 0);
    const totalFinal = totalFaturaOficial > 0 ? totalFaturaOficial : Math.round(somaCalculada * 100) / 100;

    return NextResponse.json({
      success: true,
      totalFatura: totalFinal,
      count: transacaoLista.length,
      dados: transacaoLista,
    });
  } catch (error) {
    console.error('Erro no processamento do PDF:', error);
    return NextResponse.json({ error: 'Erro interno ao processar a fatura.' }, { status: 500 });
  }
}
