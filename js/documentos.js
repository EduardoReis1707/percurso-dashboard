/* ===================== documentos da matrícula (requerimento + contrato) ===================== */
/* Gera, a partir do formulário "Nova matrícula", o Requerimento de Matrícula e o Contrato de
   Prestação de Serviços já preenchidos, numa página pronta para imprimir / salvar em PDF.
   Só ficam em branco as assinaturas (e o que não foi preenchido no formulário).
   Os textos fixos do contrato (datas do curso, taxa, material didático, horário) ficam em
   DOC_MATRICULA_CFG: é o único lugar para atualizar quando os valores mudarem. */
const DOC_MATRICULA_CFG = {
  empresa: "PERCURSO E PERSISTIR CONCURSOS Ltda.",
  cnpj: "30.026.277/0001-54",
  enderecoEmpresa: "Rua Tenente Fortunato, 200 – Sala 101/ Centro Cataguases MG",
  cidade: "Cataguases",
  inicioCurso: "15/02/2027",
  terminoCurso: "25/11/2027",
  aulasSemana: "16 (DEZESSEIS)",
  aulasAno: "450 (QUATROCENTOS E CINQUENTA)",
  horarioAulas: "de segunda a quinta-feira das 14h às 17h30min",
  taxaMatricula: "R$ 80,00 (Oitenta reais)",
  materialTotal: "R$ 480,00 (Quatrocentos e oitenta reais)",
  materialParcelas: "4(quatro) parcelas de R$ 120,00",
  materialAVista: "R$ 440,00 (Quatrocentos e quarenta reais)",
  alunosMinimos: "20 alunos",
};
/* Mesma ideia do DOC_MATRICULA_CFG, mas para a turma do 8º ano: curso mais curto, sem
   cobrança de material didático e sem a cláusula correspondente no contrato. */
const DOC_MATRICULA_CFG_8ANO = {
  inicioCurso: "16/02/2027",
  terminoCurso: "18/11/2027",
  aulasSemana: "6 (seis)",
  aulasAno: "200 (Duzentas)",
  horarioAulas: "nas Terças-feiras e Quintas-feiras das 14h às 16h50min",
  taxaMatricula: "R$ 80,00 (Oitenta reais)",
  alunosMinimos: "10 alunos",
};

/* "8" para turma do 8º ano, "9" para as demais (CEFET/ENEM) — decide qual template de
   contrato usar. Compara por normName (sem acento/maiúscula) pra não depender de "º" exato. */
function docSerieDaTurma(turma) {
  return turma && normName(turma.tipo || turma.nome || "").startsWith("8") ? "8" : "9";
}

function docV(id) { const el = byId(id); return el ? el.value.trim() : ""; }
function docEsc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
function docMoeda(raw) {
  if (!raw) return "";
  const n = parseMoneyBR(raw);
  return n === null ? String(raw) : formatMoneyBR(n);
}
/* "4x de R$ 95,00" a partir do valor e do nº de parcelas (vazio se à vista / sem dados) */
function docParcelamento(valor, parcelas) {
  const n = parseInt(parcelas, 10), v = parseMoneyBR(valor);
  if (!(n > 1) || !(v > 0)) return "";
  return `${n}x de ${formatMoneyBR(v / n)}`;
}
function docData(iso) { return iso ? fmtDate(iso) : ""; }
function docDataExtenso(iso) {
  const meses = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
  const d = iso ? new Date(iso + "T12:00:00") : new Date();
  return `${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`;
}

function docDadosMatricula() {
  const turma = turmasList.find(t => t.id === byId("f-turma").value) || null;
  return {
    turma, turmaNome: turma ? (turma.tipo === "CEFET" ? "Pré-CEFET" : turma.nome) : "", dataMat: docV("f-data-matricula"),
    aluno: {
      nome: docV("f-aluno-nome"), nasc: docV("f-aluno-nascimento"), local: docV("f-aluno-local-nasc"),
      endereco: docV("f-aluno-endereco"), bairro: docV("f-aluno-bairro"), cidade: docV("f-aluno-cidade"), cep: docV("f-aluno-cep"), uf: docV("f-aluno-uf").toUpperCase(),
      tel: docV("f-aluno-tel"), email: docV("f-aluno-email"), rg: docV("f-aluno-rg"),
      rgOrgao: docV("f-aluno-rg-orgao"), rgData: docV("f-aluno-rg-data"), cpf: docV("f-aluno-cpf"),
    },
    resp: {
      nome: docV("f-resp-nome"), nasc: docV("f-resp-nascimento"), profissao: docV("f-resp-profissao"),
      nacionalidade: docV("f-resp-nacionalidade"), tel: docV("f-resp-tel"), email: docV("f-resp-email"),
      rg: docV("f-resp-rg"), rgOrgao: docV("f-resp-rg-orgao"), rgData: docV("f-resp-rg-data"), cpf: docV("f-resp-cpf"),
    },
    fin: {
      taxa: docV("f-fin-valor-matricula"), dataPag: docV("f-fin-data-pagamento"), forma: docV("f-fin-forma"),
      total: docV("f-fin-total"), parcelas: docV("f-fin-parcelas"), parcela: docV("f-fin-valor-parcela"), venc: docV("f-fin-vencimento"),
      apostila: docV("f-fin-apostila-valor"), apostilaForma: docV("f-fin-apostila-forma"), apostilaData: docV("f-fin-apostila-data"), apostilaParcelas: docV("f-fin-apostila-parcelas"),
    },
  };
}

/* Layout idêntico aos modelos do Word: o requerimento tem a faixa verde com o logo, a caixa de borda
   verde e as barras cinza; o contrato tem logo centralizado, caixa das partes e duas colunas. */
function docAsset(nome) { try { return new URL(nome, location.href).href; } catch (e) { return nome; } }
/* número sem "R$" (os modelos já trazem "R$" no rótulo de alguns campos) */
function docNum(raw) { return docMoeda(raw).replace(/^R\$\s*/, ""); }
/* linha de preenchimento: mostra o valor sobre a linha, ou fica em branco para escrever à mão */
function docU(valor, extra) { return `<span class="u" ${extra ? `style="${extra}"` : ""}>${docEsc(valor || "")}</span>`; }
/* data em três partes: dd ╱ mm ╱ aaaa */
function docUD(iso) {
  const p = iso ? iso.split("-") : ["", "", ""];
  return `<span class="ud"><span class="u">${p[2]}</span><i>╱</i><span class="u">${p[1]}</span><i>╱</i><span class="u">${p[0]}</span></span>`;
}
function docRadio(sel, opts) { return opts.map(o => `<span class="rd">${o === sel ? "●" : "○"} ${o}</span>`).join(" "); }

function docRequerimentoHTML(d) {
  const { aluno: a, resp: r, fin: f } = d;
  const ano = d.turma ? d.turma.ano_letivo : selectedAnoLetivo;
  const dt = d.dataMat ? new Date(d.dataMat + "T12:00:00") : new Date();
  const meses = ["JANEIRO","FEVEREIRO","MARÇO","ABRIL","MAIO","JUNHO","JULHO","AGOSTO","SETEMBRO","OUTUBRO","NOVEMBRO","DEZEMBRO"];
  const venc = f.venc ? f.venc.replace(/\D/g, "") : "";
  return `<section class="req">
    <div class="banner"><svg width="794" height="108" viewBox="0 0 794 108" style="position:absolute;left:0;top:0"><polygon fill="#00a651" points="0,0 794,0 794,51 468,51 426,108 0,108"/></svg><img src="${docAsset("doc-requerimento-topo.png")}" alt=""></div>
    <div class="req-top"><span><b>Turma da Matrícula em ${ano}:</b> ${docU(d.turmaNome, "width:230px;flex:none")}</span><span><b>Data da Matrícula:</b> ${docUD(d.dataMat)}</span></div>
    <div class="req-box">
      <div class="bar">INFORMAÇÕES DO ALUNO(A):</div>
      <div class="rows">
        <div class="r"><span>Nome Completo:</span>${docU(a.nome)}</div>
        <div class="r"><span>Data de Nascimento:</span>${docUD(a.nasc)}<span class="sp">Local de Nascimento:</span>${docU(a.local)}</div>
        <div class="r"><span>Endereço do aluno( a):</span>${docU(a.endereco)}</div>
        <div class="r"><span>Cidade:</span>${docU(a.cidade)}<span class="sp">Bairro:</span>${docU(a.bairro)}</div>
        <div class="r"><span class="two">Telefone do Aluno( a):<br>ou Whatsapp:</span>${docU(a.tel, "flex:.8")}<span class="sp">Email:</span>${docU(a.email)}</div>
        <div class="r"><span>Nº do RG do Aluno( a):</span>${docU(a.rg)}<span class="sp">Data de Expedição:</span>${docUD(a.rgData)}</div>
        <div class="r"><span>Órgão Expedidor:</span>${docU(a.rgOrgao)}<span class="sp">Nº do CPF:</span>${docU(a.cpf)}</div>
      </div>
      <div class="bar">INFORMAÇÕES DO RESPONSÁVEL:</div>
      <div class="rows">
        <div class="r"><span>Nome Completo do Responsável:</span>${docU(r.nome)}</div>
        <div class="r"><span>Data de Nascimento do Responsável:</span>${docUD(r.nasc)}<span class="sp">Profissão:</span>${docU(r.profissao)}</div>
        <div class="r"><span>Telefone para Contato:</span>${docU(r.tel)}<span class="sp">email:</span>${docU(r.email)}</div>
        <div class="r"><span>Nº do RG do Responsável:</span>${docU(r.rg)}<span class="sp">Data de Expedição:</span>${docUD(r.rgData)}</div>
        <div class="r"><span>Órgão Expedidor:</span>${docU(r.rgOrgao)}<span class="sp">Nº do CPF:</span>${docU(r.cpf)}</div>
      </div>
      <div class="bar">INFORMAÇÕES FINANCEIRAS:</div>
      <div class="rows fin">
        <div class="chip">VALOR REFERENTE A MATRÍCULA:</div>
        <div class="r"><span>Valor Referente a Taxa de Matrícula:</span>${docU(docMoeda(f.taxa))}<span class="sp">Data de Pagamento:</span>${docUD(f.dataPag)}</div>
        <div class="r"><span>Forma de Pagamento:</span>${docU(f.forma, "flex:none;width:200px")}</div>
        <div class="chip">MENSALIDADE:</div>
        <div class="r"><span>Valor Total do Curso R$</span>${docU(docNum(f.total), "flex:none;width:300px")}</div>
        <div class="r"><span>Quantidade de Parcelas</span>${docU(f.parcelas)}</div>
        <div class="r"><span>Valor das Parcelas R$</span>${docU(docNum(f.parcela))}<span class="sp">Data de Vencimento:</span>${docU(venc ? "dia " + venc : "", "flex:none;width:130px")}</div>
        <div class="chip">MATERIAL DIDÁTICO:</div>
        <div class="r"><span>Valor Referente ao Material Didático:</span>${docU(docMoeda(f.apostila))}</div>
        <div class="r"><span>Forma de Pagamento do Material Didático</span>${docRadio(f.apostilaForma, ["Cartão", "Pix", "Dinheiro"])}</div>
        <div class="r"><span>Parcelamento do Material:</span>${docU(docParcelamento(f.apostila, f.apostilaParcelas), "flex:none;width:260px")}</div>
        <div class="r"><span>Data do Pagamento e Pedido do Material:</span>${docU(docData(f.apostilaData), "flex:none;width:260px")}</div>
      </div>
    </div>
    <div class="req-local"><b>CATAGUASES,</b> ${docU(String(dt.getDate()), "flex:none;width:60px;text-align:center")}<b>DE</b>${docU(meses[dt.getMonth()], "flex:none;width:190px;text-align:center")}<b>DE</b> ${docU(String(dt.getFullYear()), "flex:none;width:70px;text-align:center")}</div>
    <div class="req-sign"><div class="line"></div>ASSINATURA DO RESPONSÁVEL</div>
  </section>`;
}

/* Contrato do(a) aluno(a): dispatcher entre o template do 9º ano (Pré-CEFET, com a cláusula
   de material didático) e o do 8º ano (sem material didático, cláusulas renumeradas). */
function docContratoHTML(d) {
  return d.serie === "8" ? docContrato8AnoHTML(d) : docContrato9AnoHTML(d);
}

function docContrato9AnoHTML(d) {
  const { aluno: a, resp: r, fin: f } = d, C = DOC_MATRICULA_CFG;
  const ano = d.ano || (d.turma ? d.turma.ano_letivo : selectedAnoLetivo);
  // contratante = responsável; se o aluno não tem responsável cadastrado, ele mesmo contrata
  const c = r.nome ? r : { nome: a.nome, nacionalidade: "", cpf: a.cpf, rg: a.rg, rgOrgao: a.rgOrgao, rgData: a.rgData, profissao: "", nasc: a.nasc };
  const venc = f.venc ? "dia " + f.venc.replace(/\D/g, "") + " de cada mês" : "";
  const B = s => `<b>${s}</b>`;
  const CT = "<b>CONTRATANTE</b>", CD = "<b>CONTRATADA</b>";
  const dd = iso => { const p = iso ? iso.split("-") : ["", "", ""]; return `${p[2] || "____"} / ${p[1] || "____"} / ${p[0] || "_____"}`; };
  return `<section class="ctr"><div class="ctr-view"><div class="ctr-txt">
    <div class="ctr-logo"><img src="${docAsset("doc-contrato-logo.jpeg")}" alt=""></div>
    <p class="ctr-title"><b>CONTRATO DE PRESTAÇÃO DE SERVIÇOS EDUCACIONAIS<br>CURSO PREPARATÓRIO PARA O CEFET/MG - ${ano}</b></p>
    <div class="cr"><b>ALUNO(A):</b> ${docU(a.nome)}</div>
    <div class="ctr-box">
      <div class="ctr-partes">
        <p>Pelo presente instrumento particular de Contrato de Prestação de Serviços de Preparação para o CEFET/MG, as Partes devidamente identificadas também na Ficha de Matrícula, da qual o presente Contrato é parte integrante na forma de Anexo I, resolvem celebrar o presente Contrato, conforme cláusulas e condições a seguir expostas.</p>
        <p><b>CONTRATADO: ${docEsc(C.empresa)}</b>, inscrito no C.N.P.J sob o número <b>${docEsc(C.cnpj)}, estabelecido na ${docEsc(C.enderecoEmpresa)}, por seu representante legal;</b></p>
      </div>
      <div class="ctr-contratante">
        <div class="cr"><b>CONTRATANTE:</b>${docU(c.nome)}</div>
        <div class="cr"><b>Nacionalidade:</b>${docU(c.nacionalidade)}</div>
        <div class="cr"><b>CPF.</b>${docU(c.cpf)}</div>
        <div class="cr"><b>RG.</b>${docU(c.rg)}<b>Órgão Expedidor</b>${docU(c.rgOrgao, "flex:.7")}</div>
        <div class="cr"><b>Data Expedição ${dd(c.rgData)} Profissão</b>${docU(c.profissao)}</div>
        <div class="cr"><b>Data Nascimento ${dd(c.nasc)}</b></div>
        <div class="cr"><b>Endereço Residencial:</b>${docU(a.endereco)}</div>
        <div class="cr"><b>CEP:</b>${docU(a.cep, "flex:.8")}<b>Bairro:</b>${docU(a.bairro)}</div>
        <div class="cr"><b>Cidade:</b>${docU(a.cidade)}<b>Estado:</b>${docU(a.uf)}</div>
      </div>
    </div>
    <p>${B("CLÁUSULA PRIMEIRA – Do Objeto:")}<br>Constitui objeto do presente Contrato a Prestação de Serviços de ${B("CURSO PREPATATÓRIO PARA O CEFET")}, pela ${CD}, com aulas ministradas de forma presencial.<br>
    ${B("Parágrafo primeiro –")} A prestação desses serviços terá início em ${B(docEsc(C.inicioCurso) + " e")} previsão de término em ${B(docEsc(C.terminoCurso) + ".")} ${B("(Podendo haver modificação devido as datas das provas de acordo com seus editais em " + ano + ").")}<br>
    ${B("Parágrafo segundo")} - Está obrigada a ${CD} em fornecer aulas de Matemática, Língua Portuguesa, História, Geografia, Física, Química e Biologia no período mencionado no parágrafo primeiro.<br>
    ${B("Parágrafo terceiro")} - Está obrigada a ${CD} a prestar o serviço com uma carga horária mínima semanal de ${docEsc(C.aulasSemana)} aulas com duração de 45 minutos e no mínimo em período anual de ${docEsc(C.aulasAno)} aulas em ${ano}. O horário das aulas serão ${docEsc(C.horarioAulas)}.</p>
    <p>${B("CLÁUSULA SEGUNDA – Da Matrícula")}:<br>
    ${B("Parágrafo primeiro")} - A efetivação da matrícula se dará mediante a assinatura, pelo ${CT}, da ${B("Ficha de Matrícula")}, da adesão ao Contrato de Prestação de Serviço e do pagamento da matrícula.<br>
    ${B("Parágrafo segundo -")} Será cobrado do ${CT}, a título de matrícula, o valor equivalente a ${docEsc(C.taxaMatricula)}. Em caso de desistência, em hipótese alguma será devolvida a taxa de matrícula ao ${CT} por conta das despesas administrativas.</p>
    <p>${B("CLÁUSULA TERCEIRA – Do Valor e Forma de Pagamento da prestação de serviço:")}<br>
    ${B("Parágrafo primeiro")} – Como contraprestação pelos serviços educacionais contratados, o CONTRATANTE deverá pagar ao CONTRATADO o valor descrito na Ficha de Matrícula, nos prazos também ali descritos.</p>
    <div class="ctr-valores">
      <div class="cr">Valor Total do Curso: R$${docU(docNum(f.total))}</div>
      <div class="cr">Nº de Parcelas${docU(f.parcelas)}</div>
      <div class="cr">Valor da Parcela: R$${docU(docNum(f.parcela))}</div>
      <div class="cr">Data de Vencimento:${docU(venc)}</div>
    </div>
    <p>${B("Suspensão do desconto concedido:")} O desconto eventualmente concedido será automaticamente suspenso se o CONTRATANTE não efetuar o pagamento de qualquer das parcelas nas suas respectivas datas de vencimento, caso em que as parcelas serão automaticamente ajustadas ao Valor Integral, acrescido de encargos legais e contratuais.<br>
    ${B("Parágrafo segundo")} – O pagamento das parcelas deverá ser efetuado mediante a apresentação de comprovante, nas importâncias e vencimentos do plano de pagamento constante no parágrafo primeiro da cláusula terceira.<br>
    ${B("Parágrafo terceiro -")} O ${CT} e seu responsável legal/financeiro assumem, solidariamente, a responsabilidade pelo pagamento de todo o valor da obrigação, fracionada de acordo com os meses do período letivo. As únicas hipóteses em que o ${CT} estará dispensado de realizar o pagamento do valor total do contrato, são o trancamento/cancelamento de matrícula tempestivamente solicitados pelo ${CT} à ${CD}.<br>
    ${B("Parágrafo quarto")} - O não comparecimento do ${CT} aos atos acadêmicos contratados, bem como o não acesso aos conteúdos disponibilizados pela ${CD} ao ${CT}, não o eximirão do pagamento das parcelas, tendo em vista a disponibilidade do serviço colocado à disposição pela ${CD}.</p>
    <p>${B("CLÁUSULA QUARTA – Do Valor e Forma de Pagamento do material didático:")}<br>
    ${B("Parágrafo primeiro")} - O aluno regularmente matriculado no curso objeto deste Contrato, bem como seu responsável legal/financeiro, assumem solidariamente o compromisso da compra do material didático fornecido pela ${CD} utilizado no ano letivo em vigor, em razão da ${B("CONTRATADA,")} possuir um planejamento pedagógico voltado para este material didático.<br>
    ${B("Parágrafo segundo")} - Tem a totalização do valor desse material didático de ${B(docEsc(C.materialTotal))}. Sobre as formas de pagamento, o valor deverá ser pago de forma integral e poderá ser dividido no cartão de crédito em até ${docEsc(C.materialParcelas)}, ou com um desconto para pagamento à vista no valor de ${B(docEsc(C.materialAVista))}.<br>
    ${B("Parágrafo terceiro")} – o material didático será entregue ao aluno ou responsável financeiro no Início das aulas na sede do Percurso, somente se, o pagamento for totalizado e antecipado em no mínimo uma semana de antecedência ao início do curso. Para os que totalizaram o pagamento do material didático após o primeiro dia de aula, o prazo para entrega do material didático será de até 10 dias úteis após o pagamento totalizado.</p>
    <p>${B("CLÁUSULA QUINTA – Da rescisão")}<br>
    ${B("Parágrafo primeiro")} - O cancelamento de matrícula são os únicos atos eficazes para suspender a cobrança das parcelas escolares vincendas daquela data em diante, remanescendo a obrigação do ${CT} quanto ao pagamento das mensalidades vencidas e ainda não pagas.<br>
    ${B("Parágrafo segundo")} - Para efetivar o cancelamento de matrícula, o ${CT} deverá estar em dia com as mensalidades devidas até a data da respectiva solicitação ou, alternativamente, firmar um Instrumento de Confissão de Dívida, reconhecendo o seu débito para com a ${CD} e acordando a forma de pagamento deste débito.<br>
    ${B("Parágrafo terceiro -")} O ${CT} que requerer o cancelamento de matrícula não terá, em nenhuma hipótese e sob nenhum fundamento, direito à devolução dos valores pagos até a data da apresentação do cancelamento, visto que tais pagamentos remuneraram a serviços já prestados e custos já incorridos pela ${B("CONTRATADA.")}<br>
    ${B("Parágrafo quarto")} - Em caso de rescisão movida pelo ${CT} fica este sujeito à aplicação de multa rescisória acordada entre as partes correspondente ao valor de 1 (uma) parcela. sem prejuízo da parcela referente ao mês em que o pedido formal do cancelamento foi requerido.<br>
    ${B("Parágrafo quinto")} - A ${CD} poderá rescindir o presente Contrato quando no início das aulas não houverem a quantidade mínima de alunos para custear o curso que que são de ${docEsc(C.alunosMinimos)}. Nesta hipótese, obriga-se a ${CD} a restituir à ${CT}, mediante prévio requerimento desta, a parcela possivelmente antecipada pelo ${CT}. A restituição prevista nesta cláusula se efetivará após um prazo de 5 (cinco) dias úteis após o comunicação que não haverá o curso por não atingir o número mínimo de alunos.<br>
    ${B("Parágrafo sexto -")} Ainda, será facultado à ${CD} rescindir o presente Contrato pela prática de atos de indisciplina por parte do ${CT}, sendo devidamente quitadas as mensalidades até a data do efetivo desligamento do ${CT}, não tendo como obrigação o contratante pagar a multa de rescisão de contrato.<br>
    ${B("Parágrafo sétimo -")} Poderá a ${CD} dar por rescindido o presente Contrato na hipótese de inadimplência do ${CT} após 30 dias de inadimplência.</p>
    <p>${B("CLÁUSULA SEXTA – Das obrigações da Contratada:")}<br>São obrigações da ${CD}:<br>Atender o cronograma de atividades, transmitindo, diariamente, as aulas em local apropriado, devendo anunciar ao(a) ${CT}, com antecedência, possíveis alterações de horário, aulas complementares e/ou de reposição, que poderão ser ministradas aos sábados, domingos ou feriados.</p>
    <p>${B("CLÁUSULA SÉTIMA – das obrigações do(a) contratante:")}<br>${B("São Obrigações do(a) CONTRATANTE:")}<br>
    a) Cumprir o disposto nas cláusulas do presente Contrato, bem como na legislação em vigor;<br>
    b) Manter rigorosamente em dia o pagamento das mensalidades, sob pena de rescisão deste contrato quando vencidas e não pagas 02 (duas) parcelas, mesmo alternadas e/ou protesto do título com encaminhamento de carta negativa para registro nos órgãos ou entidades de Serviço de Proteção ao Crédito pela ${CD}.</p>
    <p>${B("CLÁUSULA OITAVA– Da divulgação da imagem do aluno:")}<br>O CONTRATADO, livre de quaisquer ônus para com o CONTRATANTE / ALUNO, poderá utilizar seu nome e sua imagem para fins exclusivos de divulgação do CONTRATADO e de suas atividades, podendo, para tanto, reproduzi-la ou divulgá-la junto à internet e quaisquer outros meios de comunicação, públicos e privados, dentro do período de 05 anos, comprometendo-se a não utilizá-la de maneira contrária à moral ou aos bons costumes.</p>
    <p>${B("CLÁUSULA NONA – Do Foro de Eleição:")}<br>As partes elegem o Foro da cidade de Cataguases-Mg, para dirimir eventuais dúvidas e controvérsias oriundas do presente Contrato, renunciando a qualquer outro por mais privilegiado que seja. E por estarem de acordo, assinam o presente instrumento em duas vias de igual teor.</p>
    <p class="ctr-data">${docEsc(C.cidade)}, ${docEsc(docDataExtenso(d.dataMat))}</p>
    <div class="ctr-sign"><div class="line"></div><b>CONTRATADA</b></div>
    <div class="ctr-sign"><div class="line"></div><b>CONTRATANTE</b></div>
    </div></div>
  </section>`;
}

/* Contrato da turma do 8º ano: mesma estrutura visual do contrato do 9º ano (Pré-CEFET), mas
   sem a cláusula de material didático (não há cobrança de apostila nessa turma), com as
   cláusulas seguintes renumeradas e os dados do curso (datas, carga horária, horário) próprios. */
function docContrato8AnoHTML(d) {
  const { aluno: a, resp: r, fin: f } = d, C = DOC_MATRICULA_CFG_8ANO;
  const ano = d.ano || (d.turma ? d.turma.ano_letivo : selectedAnoLetivo);
  const c = r.nome ? r : { nome: a.nome, nacionalidade: "", cpf: a.cpf, rg: a.rg, rgOrgao: a.rgOrgao, rgData: a.rgData, profissao: "", nasc: a.nasc };
  const venc = f.venc ? "dia " + f.venc.replace(/\D/g, "") + " de cada mês" : "";
  const B = s => `<b>${s}</b>`;
  const CT = "<b>CONTRATANTE</b>", CD = "<b>CONTRATADA</b>";
  const dd = iso => { const p = iso ? iso.split("-") : ["", "", ""]; return `${p[2] || "____"} / ${p[1] || "____"} / ${p[0] || "_____"}`; };
  return `<section class="ctr"><div class="ctr-view"><div class="ctr-txt">
    <div class="ctr-logo"><img src="${docAsset("doc-contrato-logo.jpeg")}" alt=""></div>
    <p class="ctr-title"><b>CONTRATO DE PRESTAÇÃO DE SERVIÇOS EDUCACIONAIS<br>CURSO PREPARATÓRIO PARA O CEFET/MG - 8º ANO - ${ano}</b></p>
    <div class="cr"><b>ALUNO(A):</b> ${docU(a.nome)}</div>
    <div class="ctr-box">
      <div class="ctr-partes">
        <p>Pelo presente instrumento particular de Contrato de Prestação de Serviços de Preparação para o CEFET/MG, as Partes devidamente identificadas também na Ficha de Matrícula, da qual o presente Contrato é parte integrante na forma de Anexo I, resolvem celebrar o presente Contrato, conforme cláusulas e condições a seguir expostas.</p>
        <p><b>CONTRATADO: ${docEsc(DOC_MATRICULA_CFG.empresa)}</b>, inscrito no C.N.P.J sob o número <b>${docEsc(DOC_MATRICULA_CFG.cnpj)}, estabelecido na ${docEsc(DOC_MATRICULA_CFG.enderecoEmpresa)}, por seu representante legal;</b></p>
      </div>
      <div class="ctr-contratante">
        <div class="cr"><b>CONTRATANTE:</b>${docU(c.nome)}</div>
        <div class="cr"><b>Nacionalidade:</b>${docU(c.nacionalidade)}</div>
        <div class="cr"><b>CPF.</b>${docU(c.cpf)}</div>
        <div class="cr"><b>RG.</b>${docU(c.rg)}<b>Órgão Expedidor</b>${docU(c.rgOrgao, "flex:.7")}</div>
        <div class="cr"><b>Data Expedição ${dd(c.rgData)} Profissão</b>${docU(c.profissao)}</div>
        <div class="cr"><b>Data Nascimento ${dd(c.nasc)}</b></div>
        <div class="cr"><b>Endereço Residencial:</b>${docU(a.endereco)}</div>
        <div class="cr"><b>CEP:</b>${docU(a.cep, "flex:.8")}<b>Bairro:</b>${docU(a.bairro)}</div>
        <div class="cr"><b>Cidade:</b>${docU(a.cidade)}<b>Estado:</b>${docU(a.uf)}</div>
      </div>
    </div>
    <p>${B("CLÁUSULA PRIMEIRA – Do Objeto:")}<br>Constitui objeto do presente Contrato a Prestação de Serviços de ${B("CURSO PREPATATÓRIO PARA O CEFET")}, pela ${CD}, com aulas ministradas de forma presencial.<br>
    ${B("Parágrafo primeiro –")} A prestação desses serviços terá início em ${B(docEsc(C.inicioCurso) + " e")} previsão de término em ${B(docEsc(C.terminoCurso) + ".")} (As Aulas acontecerão duas vezes na semana nas Terças e Quintas-feiras). ${B("(Podendo haver modificação devido as datas das provas de acordo com seus editais em " + ano + ").")}<br>
    ${B("Parágrafo segundo")} - Está obrigada a ${CD} em fornecer aulas de Matemática, Língua Portuguesa, História, Geografia, Física, Química e Biologia no período mencionado no parágrafo primeiro.<br>
    ${B("Parágrafo terceiro")} - Está obrigada a ${CD} a prestar o serviço com uma carga horária mínima semanal de ${docEsc(C.aulasSemana)} aulas com duração de 50 minutos e no mínimo em período anual de ${docEsc(C.aulasAno)} aulas em ${ano}. O horário das aulas serão ${docEsc(C.horarioAulas)}.</p>
    <p>${B("CLÁUSULA SEGUNDA – Da Matrícula")}:<br>
    ${B("Parágrafo primeiro")} - A efetivação da matrícula se dará mediante a assinatura, pelo ${CT}, da ${B("Ficha de Matrícula")}, da adesão ao Contrato de Prestação de Serviço e do pagamento da matrícula.<br>
    ${B("Parágrafo segundo -")} Será cobrado do ${CT}, a título de matrícula, o valor equivalente a ${docEsc(C.taxaMatricula)}. Em caso de desistência, em hipótese alguma será devolvida a taxa de matrícula ao ${CT} por conta das despesas administrativas.</p>
    <p>${B("CLÁUSULA TERCEIRA – Do Valor e Forma de Pagamento da prestação de serviço:")}<br>
    ${B("Parágrafo primeiro")} – Como contraprestação pelos serviços educacionais contratados, o CONTRATANTE deverá pagar ao CONTRATADO o valor descrito na Ficha de Matrícula, nos prazos também ali descritos.</p>
    <div class="ctr-valores">
      <div class="cr">Valor Total do Curso: R$${docU(docNum(f.total))}</div>
      <div class="cr">Nº de Parcelas${docU(f.parcelas)}</div>
      <div class="cr">Valor da Parcela: R$${docU(docNum(f.parcela))}</div>
      <div class="cr">Data de Vencimento:${docU(venc)}</div>
    </div>
    <p>${B("Suspensão do desconto concedido:")} O desconto eventualmente concedido será automaticamente suspenso se o CONTRATANTE não efetuar o pagamento de qualquer das parcelas nas suas respectivas datas de vencimento, caso em que as parcelas serão automaticamente ajustadas ao Valor Integral, acrescido de encargos legais e contratuais.<br>
    ${B("Parágrafo segundo")} – O pagamento das parcelas deverá ser efetuado mediante a apresentação do comprovante, nas importâncias e vencimentos do plano de pagamento constante no parágrafo primeiro da cláusula terceira.<br>
    ${B("Parágrafo terceiro -")} O ${CT} e seu responsável legal/financeiro assumem, solidariamente, a responsabilidade pelo pagamento de todo o valor da obrigação, fracionada de acordo com os meses do período letivo. As únicas hipóteses em que o ${CT} estará dispensado de realizar o pagamento do valor total do contrato, são o trancamento/cancelamento de matrícula tempestivamente solicitados pelo ${CT} à ${CD}.<br>
    ${B("Parágrafo quarto")} - O não comparecimento do ${CT} aos atos acadêmicos contratados, bem como o não acesso aos conteúdos disponibilizados pela ${CD} ao ${CT}, não o eximirão do pagamento das parcelas, tendo em vista a disponibilidade do serviço colocado à disposição pela ${CD}.</p>
    <p>${B("CLÁUSULA QUARTA – Da rescisão")}<br>
    ${B("Parágrafo primeiro")} - O cancelamento de matrícula são os únicos atos eficazes para suspender a cobrança das parcelas vincendas daquela data em diante, remanescendo a obrigação do ${CT} quanto ao pagamento das parcelas vencidas e ainda não pagas.<br>
    ${B("Parágrafo segundo")} - Para efetivar o cancelamento de matrícula, o ${CT} deverá estar em dia com as mensalidades devidas até a data da respectiva solicitação ou, alternativamente, firmar um Instrumento de Confissão de Dívida, reconhecendo o seu débito para com a ${CD} e acordando a forma de pagamento deste débito.<br>
    ${B("Parágrafo terceiro -")} O ${CT} que requerer o cancelamento de matrícula não terá, em nenhuma hipótese e sob nenhum fundamento, direito à devolução dos valores pagos até a data da apresentação do cancelamento, visto que tais pagamentos remuneraram a serviços já prestados e custos já incorridos pela ${B("CONTRATADA.")}<br>
    ${B("Parágrafo quarto")} - Em caso de rescisão movida pelo ${CT} fica este sujeito à aplicação de multa rescisória acordada entre as partes correspondente ao valor de 1 (uma) parcela. sem prejuízo da parcela referente ao mês em que o pedido formal do cancelamento foi requerido.<br>
    ${B("Parágrafo quinto")} - A ${CD} poderá rescindir o presente Contrato quando no início das aulas não houverem a quantidade mínima de alunos para custear o curso que que são de ${docEsc(C.alunosMinimos)}. Nesta hipótese, obriga-se a ${CD} a restituir à ${CT}, mediante prévio requerimento desta, a parcela possivelmente antecipada pelo ${CT}. A restituição prevista nesta cláusula se efetivará após um prazo de 5 (cinco) dias úteis após a comunicação que não haverá o curso por não atingir o número mínimo de alunos.<br>
    ${B("Parágrafo sexto -")} Ainda, será facultado à ${CD} rescindir o presente Contrato pela prática de atos de indisciplina por parte do ${CT}, sendo devidamente quitadas as mensalidades até a data do efetivo desligamento do ${CT}, não tendo como obrigação o contratante pagar a multa de rescisão de contrato.<br>
    ${B("Parágrafo sétimo -")} Poderá a ${CD} dar por rescindido o presente Contrato na hipótese de inadimplência do ${CT} após 30 dias de inadimplência.</p>
    <p>${B("CLÁUSULA QUINTA – Das obrigações da Contratada:")}<br>São obrigações da ${CD}:<br>Atender o cronograma de atividades, transmitindo, diariamente, as aulas em local apropriado, devendo anunciar ao(a) ${CT}, com antecedência, possíveis alterações de horário, aulas complementares e/ou de reposição, que poderão ser ministradas em outros dias e outros horários.</p>
    <p>${B("CLÁUSULA SEXTA – das obrigações do(a) contratante:")}<br>${B("São Obrigações do(a) CONTRATANTE:")}<br>
    a) Cumprir o disposto nas cláusulas do presente Contrato, bem como na legislação em vigor;<br>
    b) Manter rigorosamente em dia o pagamento das parcelas, sob pena de rescisão deste contrato quando vencidas e não pagas 02 (duas) parcelas, mesmo alternadas e/ou protesto do título com encaminhamento de carta negativa para registro nos órgãos ou entidades de Serviço de Proteção ao Crédito pela ${CD}.</p>
    <p>${B("CLÁUSULA SÉTIMA – Da divulgação da imagem do aluno:")}<br>O CONTRATADO, livre de quaisquer ônus para com o CONTRATANTE / ALUNO, poderá utilizar seu nome e sua imagem para fins exclusivos de divulgação do CONTRATADO e de suas atividades, podendo, para tanto, reproduzi-la ou divulgá-la junto à internet e quaisquer outros meios de comunicação, públicos e privados, dentro do período de 05 anos, comprometendo-se a não utilizá-la de maneira contrária à moral ou aos bons costumes.</p>
    <p>${B("CLÁUSULA OITAVA – Do Foro de Eleição:")}<br>As partes elegem o Foro da cidade de Cataguases-Mg, para dirimir eventuais dúvidas e controvérsias oriundas do presente Contrato, renunciando a qualquer outro por mais privilegiado que seja. E por estarem de acordo, assinam o presente instrumento em duas vias de igual teor.</p>
    <p class="ctr-data">${docEsc(DOC_MATRICULA_CFG.cidade)}, ${docEsc(docDataExtenso(d.dataMat))}</p>
    <div class="ctr-sign"><div class="line"></div><b>CONTRATADA</b></div>
    <div class="ctr-sign"><div class="line"></div><b>CONTRATANTE</b></div>
    </div></div>
  </section>`;
}

const DOC_CSS = `
  html { color-scheme: light; background: #fff; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { width: 210mm; margin: 0 auto; background: #fff; color: #000; font-family: Arial, Helvetica, sans-serif; }
  @page { size: A4; margin: 0; }
  b, strong { font-weight: 700; }
  .u { flex: 1; border-bottom: 1px solid #000; min-height: 15px; padding: 0 4px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: clip; align-self: flex-end; }
  .ud { display: inline-flex; align-items: flex-end; gap: 2px; }
  .ud .u { flex: none; width: 36px; text-align: center; padding: 0; }
  .ud .u:last-child { width: 50px; }
  .ud i { font-style: normal; font-size: 18px; line-height: 14px; font-weight: 300; }

  /* ---------- Requerimento ---------- */
  .req { width: 210mm; height: 297mm; page-break-after: always; overflow: hidden; position: relative; }
  .banner { height: 108px; position: relative; }
  .banner img { position: absolute; left: 70px; top: 12px; height: 84px; }
  .req-top { display: flex; justify-content: space-between; align-items: flex-end; padding: 0 44px 0 48px; margin: 22px 0 10px; font-size: 11.5px; font-weight: 700; white-space: nowrap; }
  .req-top > span { display: inline-flex; align-items: flex-end; gap: 6px; }
  .req-box { margin: 0 36px; border: 3px solid #0b8f3f; border-top: 0; }
  .bar { background: #d9d9d9; text-align: center; font-weight: 700; font-size: 11.5px; letter-spacing: 1.6px; padding: 8px 0; margin: 0 -3px; }
  .rows { padding: 10px 14px 2px 14px; font-size: 11.5px; font-weight: 700; letter-spacing: .4px; }
  .r { display: flex; align-items: flex-end; gap: 6px; margin: 0 0 7px; min-height: 21px; }
  .r > span:not(.u):not(.ud):not(.rd) { white-space: nowrap; }
  .r .sp { margin-left: 10px; }
  .r .two { line-height: 1.15; }
  .rd { margin-left: 10px; white-space: nowrap; }
  .fin { font-size: 11.5px; font-weight: 700; letter-spacing: .4px; }
  .chip { display: inline-block; background: #d9d9d9; font-weight: 700; font-size: 11.5px; letter-spacing: 1.6px; padding: 3px 6px; margin: 2px 0 7px; align-self: flex-start; }
  .rows.fin .r { margin-bottom: 6px; min-height: 19px; }
  .req-local { display: flex; align-items: flex-end; justify-content: center; gap: 6px; font-size: 11.5px; font-weight: 700; letter-spacing: .4px; margin: 12px 80px 0; }
  .req-local .u { text-align: center; }
  .req-sign { width: 60%; margin: 26px auto 0; text-align: center; font-size: 11.5px; font-weight: 700; letter-spacing: .4px; }
  .line { border-top: 1px solid #000; margin-bottom: 5px; }

  /* ---------- Contrato ---------- */
  .ctr { width: 210mm; height: 297mm; padding: 10mm 7.5mm 6mm 10mm; font-size: 9.7pt; line-height: 1.2; page-break-after: always; overflow: hidden; position: relative; }
  .ctr-view { height: 281mm; overflow: hidden; position: relative; }
  .ctr-logo { text-align: center; margin: 0 0 6px; }
  .ctr-logo img { width: 190px; }
  .ctr-title { text-align: center; font-size: 8.6pt; white-space: nowrap; margin: 4px 0 10px; }
  .ctr p { margin: 0; text-align: justify; }
  .ctr-txt { height: 100%; column-count: 2; column-gap: 5mm; column-fill: auto; }
  .ctr-txt p { margin: 0 0 1px; }
  .cr { display: flex; align-items: flex-end; gap: 3px; white-space: nowrap; margin: 2px 0; }
  .ctr-box { border: 1px solid #000; margin: 4px 0 6px; break-inside: avoid; }
  .ctr-partes { padding: 6px 8px; border-bottom: 1px solid #000; }
  .ctr-partes p { margin-bottom: 8px; }
  .ctr-contratante { padding: 6px 8px 2px; }
  .ctr-valores { break-inside: avoid; background: #f0f0f0; padding: 3px 4px; margin: 4px 0; }
  .ctr-data { text-align: center !important; margin: 14px 0 22px !important; }
  .ctr-sign { text-align: center; margin: 0 14px 20px; break-inside: avoid; }

  /* ---------- Recibo ---------- */
  .rec { width: 210mm; height: 297mm; padding: 12mm 14mm; page-break-after: always; overflow: hidden; }
  .rc { border: 3px solid #000; border-radius: 14px; padding: 10px; margin-bottom: 4mm; }
  .rc-top { border: 3px solid #000; border-radius: 10px; display: flex; align-items: center; justify-content: space-between; padding: 8px 16px; margin-bottom: 10px; }
  .rc-titulo { font-size: 30px; font-weight: 800; }
  .rc-no { font-size: 16px; } .rc-no span { display: inline-block; min-width: 50px; text-align: center; font-weight: 400; }
  .rc-valor { font-size: 18px; font-weight: 800; display: flex; align-items: center; gap: 12px; }
  .rc-v { background: #e7e6e6; padding: 8px 14px; display: inline-flex; gap: 24px; font-size: 17px; font-weight: 800; }
  .rc-v i { font-style: normal; }
  .rc-corpo { border: 3px solid #000; border-radius: 10px; padding: 14px 18px 16px; }
  .rc-linha { display: flex; align-items: flex-end; gap: 10px; margin: 13px 0; font-size: 13px; }
  .rc-linha b { white-space: nowrap; }
  .rc-u { flex: 1; border-bottom: 1px solid #000; min-height: 18px; padding: 0 4px; font-size: 13px; font-weight: 400; }
  .rc-data { justify-content: flex-end; padding-left: 120px; }
  .rc-corte { text-align: center; color: #888; font-size: 12px; margin: 2mm 0 6mm; white-space: nowrap; overflow: hidden; }

  /* ---------- Relatórios do aluno (simulados) ---------- */
  .rel { width: 210mm; height: 297mm; page-break-after: always; overflow: hidden; position: relative; font-size: 11px; }
  .rel-top { background: #00a651; height: 25mm; display: flex; align-items: center; justify-content: space-between; padding: 0 14mm; color: #fff; }
  .rel-top img { height: 15mm; }
  .rel-top .t { text-align: right; } .rel-top h1 { font-size: 17px; margin: 0; font-weight: 800; color: #fff; } .rel-top .s { font-size: 11px; opacity: .92; margin-top: 2px; }
  .rel-body { padding: 7mm 14mm 0; }
  .rel-aluno { border-bottom: 2px solid #111; padding-bottom: 6px; margin-bottom: 10px; }
  .rel-aluno .n { font-size: 19px; font-weight: 800; } .rel-aluno .m { font-size: 11px; color: #444; margin-top: 2px; }
  .rel-kpis { display: flex; gap: 8px; margin-bottom: 6px; }
  .rel-kpi { flex: 1; border: 1.5px solid #111; border-radius: 8px; padding: 7px 6px; text-align: center; }
  .rel-kpi .kv { font-size: 20px; font-weight: 800; line-height: 1.1; } .rel-kpi .kv small { font-size: 11px; font-weight: 600; color: #555; }
  .rel-kpi .kl { font-size: 8.5px; text-transform: uppercase; letter-spacing: .04em; color: #555; margin-top: 3px; }
  .rel h2 { font-size: 11.5px; background: #e5e7eb; padding: 4px 8px; margin: 11px 0 6px; font-weight: 800; letter-spacing: .03em; }
  .rel-t { width: 100%; border-collapse: collapse; font-size: 10.5px; }
  .rel-t th { text-align: left; font-size: 9px; text-transform: uppercase; color: #555; border-bottom: 1.5px solid #111; padding: 4px 5px; }
  .rel-t td { padding: 4px 5px; border-bottom: 1px solid #ddd; vertical-align: middle; }
  .rb { height: 9px; background: #eee; border-radius: 5px; overflow: hidden; } .rb i { display: block; height: 100%; }
  .rchip { display: inline-block; padding: 1px 7px; border-radius: 9px; font-size: 9px; font-weight: 700; color: #fff; }
  .c-forte { background: #1b7f4b; } .c-bom { background: #5aa469; } .c-reg { background: #d98f1e; } .c-fraco { background: #c0392b; }
  .rel-cols { display: flex; gap: 10px; } .rel-cols > div { flex: 1; }
  .rel ul { margin: 2px 0 0 14px; padding: 0; line-height: 1.55; }
  .rel-mapa { display: grid; grid-template-columns: repeat(10, 1fr); gap: 3px; }
  .rel-q { border: 1px solid #999; border-radius: 4px; text-align: center; font-size: 9px; padding: 2px 0; }
  .rel-q.ok { background: #d9f0e2; border-color: #1b7f4b; } .rel-q.no { background: #f8d9d5; border-color: #c0392b; }
  .rel-rodape { position: absolute; left: 14mm; right: 14mm; bottom: 8mm; font-size: 9px; color: #666; border-top: 1px solid #ccc; padding-top: 4px; display: flex; justify-content: space-between; }
`;

/* Pagina o contrato: o texto corre em 2 colunas de altura fixa; cada par de colunas vira uma folha A4. */
const DOC_SCRIPT = "window.addEventListener('load',function(){var src=document.querySelector('section.ctr');if(!src||src.dataset.pag)return;src.dataset.pag='1';var txt=src.querySelector('.ctr-txt');var W=txt.clientWidth,g=parseFloat(getComputedStyle(txt).columnGap)||0,cw=(W-g)/2;var cols=Math.round((txt.scrollWidth+g)/(cw+g));var pages=Math.max(1,Math.ceil(cols/2));var last=src;for(var i=1;i<pages;i++){var c=src.cloneNode(true);c.querySelector('.ctr-txt').style.transform='translateX('+(-i*(W+g))+'px)';last.parentNode.insertBefore(c,last.nextSibling);last=c;}window.__docPronto=true;});";

function docCarregarScript(win, src) {
  return new Promise((ok, falha) => {
    const s = win.document.createElement("script");
    s.src = src; s.onload = ok; s.onerror = () => falha(new Error("não foi possível carregar " + src));
    win.document.head.appendChild(s);
  });
}
/* PDF de verdade (download direto): cada folha A4 vira uma imagem em alta resolução dentro do PDF */
async function docConstruirPdf(fr, escala, qualidade) {
  const win = fr.contentWindow;
  if (!win.html2canvas) await docCarregarScript(win, "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js");
  if (!win.jspdf) await docCarregarScript(win, "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
  const folhas = [...win.document.querySelectorAll("section.req, section.ctr, section.rec, section.rel")];
  const pdf = new win.jspdf.jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  for (let i = 0; i < folhas.length; i++) {
    const canvas = await win.html2canvas(folhas[i], { scale: escala, useCORS: true, backgroundColor: "#fff" });
    if (i) pdf.addPage();
    pdf.addImage(canvas.toDataURL("image/jpeg", qualidade), "JPEG", 0, 0, 210, 297);
  }
  return pdf;
}
async function docSalvarPdf(fr, nomeArquivo) {
  const pdf = await docConstruirPdf(fr, 2, 0.95);
  const url = URL.createObjectURL(pdf.output("blob"));
  const a = document.createElement("a");
  a.href = url; a.download = nomeArquivo + ".pdf";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
/* Mostra o documento numa camada sobre o painel (sem janela nova, que muitos navegadores bloqueiam),
   com botões separados: Imprimir e Salvar PDF. */
function docMontar(corpoHTML, titulo) {
  return "<!doctype html><html lang=\"pt-BR\"><head><meta charset=\"utf-8\"><title>" + docEsc(titulo) + "</title><style>" + DOC_CSS + "</style></head><body>" + corpoHTML + "<scr" + "ipt>" + DOC_SCRIPT + "</scr" + "ipt></body></html>";
}
function abrirDocumento(corpoHTML, titulo, nomeArquivo) {
  const doc = docMontar(corpoHTML, titulo);
  let ov = byId("docs-overlay");
  if (ov) ov.remove();
  ov = document.createElement("div");
  ov.id = "docs-overlay";
  ov.style.cssText = "position:fixed;inset:0;z-index:500;background:#e5e7eb;display:flex;flex-direction:column";
  const btn = "padding:7px 14px;border:0;border-radius:6px;cursor:pointer;font-weight:600";
  ov.innerHTML = `<div style="background:#1f2937;color:#fff;padding:10px 16px;display:flex;gap:12px;align-items:center;justify-content:space-between;font-size:13px">
      <span>${docEsc(titulo)}</span>
      <span style="display:flex;gap:8px"><button id="docs-print" style="${btn}">Imprimir</button><button id="docs-pdf" style="${btn}">Salvar PDF</button><button id="docs-close" style="${btn};font-weight:400">Fechar</button></span></div>
    <iframe id="docs-frame" style="flex:1;border:0;background:#e5e7eb;width:100%"></iframe>`;
  document.body.appendChild(ov);
  const fr = byId("docs-frame");
  fr.srcdoc = doc;
  byId("docs-close").onclick = () => ov.remove();
  byId("docs-print").onclick = () => { fr.contentWindow.focus(); fr.contentWindow.print(); };
  const bPdf = byId("docs-pdf");
  bPdf.onclick = async () => {
    bPdf.disabled = true; const txt = bPdf.textContent; bPdf.textContent = "Gerando PDF…";
    try { await docSalvarPdf(fr, nomeArquivo); }
    catch (err) { console.error(err); alert("Não consegui gerar o PDF direto (" + (err.message || err) + "). Use Imprimir e escolha \"Salvar como PDF\" no lugar da impressora."); }
    finally { bPdf.disabled = false; bPdf.textContent = txt; }
  };
}
function docNomeArquivo(prefixo, nome) {
  return prefixo + " - " + String(nome || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9 ]/g, "").trim().replace(/\s+/g, " ");
}
async function gerarDocumentosMatricula() {
  try {
    const d = docDadosMatricula();
    if (!d.aluno.nome) { alert("Preencha pelo menos o nome do aluno antes de gerar o requerimento."); byId("f-aluno-nome").focus(); return; }
    if (!(await confirmarProblemas(problemasMatricula(true), "gerar o requerimento"))) return;
    abrirDocumento(docRequerimentoHTML(d), "Requerimento de matrícula — " + d.aluno.nome, docNomeArquivo("Requerimento", d.aluno.nome));
  } catch (err) {
    console.error(err);
    alert("Não consegui gerar o requerimento: " + (err.message || err));
  }
}
byId("gen-docs-btn").addEventListener("click", gerarDocumentosMatricula);
byId("f-aluno-cep").addEventListener("input", e => { const d = e.target.value.replace(/\D/g, "").slice(0, 8); e.target.value = d.length > 5 ? d.slice(0, 5) + "-" + d.slice(5) : d; });
byId("f-aluno-uf").addEventListener("input", e => { e.target.value = e.target.value.replace(/[^A-Za-z]/g, "").toUpperCase(); });
/* Contrato a partir do formulário "Nova matrícula": o contratante é o responsável (ou o próprio aluno, se não houver). */
async function gerarContratoDoFormulario() {
  try {
    const d = docDadosMatricula();
    if (!d.aluno.nome) { alert("Preencha pelo menos o nome do aluno antes de gerar o contrato."); byId("f-aluno-nome").focus(); return; }
    if (!(await confirmarProblemas(problemasMatricula(true), "gerar o contrato"))) return;
    const r = d.resp.nome ? d.resp : { nome: d.aluno.nome, nacionalidade: "", cpf: d.aluno.cpf, rg: d.aluno.rg, rgOrgao: d.aluno.rgOrgao, rgData: d.aluno.rgData, profissao: "", nasc: d.aluno.nasc };
    const c = {
      ano: d.turma ? d.turma.ano_letivo : selectedAnoLetivo, turma: d.turma, dataMat: d.dataMat,
      serie: docSerieDaTurma(d.turma),
      aluno: { nome: d.aluno.nome, endereco: d.aluno.endereco, bairro: d.aluno.bairro, cidade: d.aluno.cidade, cep: d.aluno.cep, uf: d.aluno.uf },
      resp: { nome: r.nome, nacionalidade: r.nacionalidade, cpf: r.cpf, rg: r.rg, rgOrgao: r.rgOrgao, rgData: r.rgData, profissao: r.profissao, nasc: r.nasc },
      fin: { total: d.fin.total, parcelas: d.fin.parcelas, parcela: d.fin.parcela, venc: d.fin.venc },
    };
    abrirDocumento(docContratoHTML(c), "Contrato — " + d.aluno.nome, docNomeArquivo("Contrato", d.aluno.nome));
  } catch (err) {
    console.error(err);
    alert("Não consegui gerar o contrato: " + (err.message || err));
  }
}
byId("gen-contrato-form-btn").addEventListener("click", gerarContratoDoFormulario);
["f-fin-valor-matricula", "f-fin-total", "f-fin-valor-parcela", "f-fin-apostila-valor"].forEach(id => byId(id).addEventListener("input", maskMoneyInput));

["f-fin-total", "f-fin-parcelas"].forEach(id => byId(id).addEventListener("blur", () => {
  const t = parseMoneyBR(docV("f-fin-total")), n = parseInt(docV("f-fin-parcelas"), 10);
  const campo = byId("f-fin-valor-parcela");
  if (!campo.value.trim() && t > 0 && n > 0) campo.value = formatMoneyBR(t / n);
}));

/* ===================== aba Contrato ===================== */
function cV(id) { return (byId("c-" + id) || {}).value || ""; }
function cSet(id, v) { const el = byId("c-" + id); if (el) { el.value = v == null ? "" : v; if (el._atualizarDica) el._atualizarDica(); } }
function contratoPopularLista() {
  byId("c-alunos").innerHTML = students.map(s => `<option value="${esc(s.nome)}"></option>`).join("");
}
function contratoLimpar() {
  ["busca", "nome", "nacionalidade", "cpf", "rg", "rg-orgao", "rg-data", "profissao", "nasc", "endereco", "cep", "bairro", "uf", "aluno-nome", "total", "parcelas", "parcela", "venc"].forEach(id => cSet(id, ""));
  cSet("cidade", "Cataguases"); cSet("data", new Date().toISOString().slice(0, 10)); cSet("serie", "9");
  byId("c-cpf-hint").textContent = ""; byId("c-cpf").classList.remove("cpf-valid", "cpf-invalid");
}
function contratoPreencher(x) {
  cSet("nome", x.nome); cSet("nacionalidade", x.nacionalidade); cSet("cpf", x.cpf ? maskCPF(x.cpf) : ""); cSet("rg", x.rg); cSet("rg-orgao", x.rgOrgao); cSet("rg-data", x.rgData);
  cSet("profissao", x.profissao); cSet("nasc", x.nasc); cSet("endereco", x.endereco); cSet("cep", x.cep); cSet("bairro", x.bairro);
  cSet("cidade", x.cidade || "Cataguases"); cSet("uf", x.uf); cSet("aluno-nome", x.alunoNome); cSet("serie", x.serie || "9");
  cSet("total", formatMoneyBR(x.total)); cSet("parcelas", x.parcelas || ""); cSet("parcela", formatMoneyBR(x.parcela)); cSet("venc", x.venc);
  byId("c-cpf").dispatchEvent(new Event("input"));
}
function contratoCarregarAluno() {
  const nome = cV("busca").trim();
  const s = students.find(x => normName(x.nome) === normName(nome));
  if (!s) { alert("Aluno não encontrado. Escolha um nome da lista."); return; }
  const temResp = s.responsavel && s.responsavel !== "—";
  const end = [s.endereco, s.numero, s.complemento].filter(Boolean).join(", ");
  const turma = s.turmaId ? turmasList.find(t => t.id === s.turmaId) : null;
  contratoPreencher({
    nome: temResp ? s.responsavel : s.nome, cpf: temResp ? s.respCpf : s.cpf, rg: temResp ? s.respRg : s.rg, rgOrgao: temResp ? s.respRgOrgao : s.rgOrgao,
    rgData: temResp ? s.respRgData : s.rgData, profissao: temResp ? s.profissaoResp : "", nasc: temResp ? s.respNascimento : s.nascimento,
    nacionalidade: "", endereco: end, cep: s.cep || "", bairro: s.bairro, cidade: s.cidade, uf: s.uf || "",
    alunoNome: s.nome, total: s.finTotalCurso, parcelas: s.finQtdParcelas, parcela: s.mensalidade, venc: s.vencimento && s.vencimento !== "—" ? s.vencimento : "",
    serie: docSerieDaTurma(turma),
  });
}
function contratoDoRequerimento() {
  const d = docDadosMatricula();
  if (!d.aluno.nome) { alert("O formulário Nova matrícula está vazio. Preencha o requerimento primeiro."); return; }
  const r = d.resp.nome ? d.resp : { nome: d.aluno.nome, cpf: d.aluno.cpf, rg: d.aluno.rg, rgOrgao: d.aluno.rgOrgao, rgData: d.aluno.rgData, profissao: "", nasc: d.aluno.nasc, nacionalidade: "" };
  contratoPreencher({
    nome: r.nome, nacionalidade: r.nacionalidade, cpf: r.cpf, rg: r.rg, rgOrgao: r.rgOrgao, rgData: r.rgData, profissao: r.profissao, nasc: r.nasc,
    endereco: d.aluno.endereco, cep: d.aluno.cep, bairro: d.aluno.bairro, cidade: d.aluno.cidade, uf: d.aluno.uf, alunoNome: d.aluno.nome,
    total: parseMoneyBR(d.fin.total), parcelas: d.fin.parcelas, parcela: parseMoneyBR(d.fin.parcela), venc: d.fin.venc,
    serie: docSerieDaTurma(d.turma),
  });
}
function problemasContrato() {
  const out = [];
  if (!cV("rg").trim()) out.push("RG: não preenchido");
  const add = (campo, msg) => { if (msg) out.push(campo + ": " + msg); };
  add("RG", valRG(cV("rg"), cV("cpf")));
  add("Nascimento", valNascimento(cV("nasc"), "resp"));
  add("Expedição do RG", valExpedicao(cV("rg-data"), cV("nasc")));
  if (cV("cpf") && !validarCPF(cV("cpf"))) out.push("CPF: inválido");
  const cep = cV("cep").replace(/\D/g, "");
  if (cep && cep.length !== 8) out.push("CEP: deve ter 8 dígitos");
  const uf = cV("uf").trim();
  if (uf && !/^[A-Za-z]{2}$/.test(uf)) out.push("Estado: use a sigla com 2 letras (ex: MG)");
  const parcelas = cV("parcelas").trim();
  if (parcelas && !(parseInt(parcelas, 10) > 0)) out.push("Nº de parcelas: número inválido");
  if (!dataValida(cV("data"))) out.push("Data do contrato: inválida");
  return out;
}
async function gerarContrato() {
  try {
    if (!cV("nome").trim()) { alert("Preencha o nome do contratante (ou carregue um aluno)."); byId("c-nome").focus(); return; }
    if (!cV("aluno-nome").trim()) { alert("Preencha o nome do aluno."); byId("c-aluno-nome").focus(); return; }
    if (!(await confirmarProblemas(problemasContrato(), "gerar o contrato"))) return;
    const d = {
      ano: selectedAnoLetivo, turma: null, dataMat: cV("data"), serie: cV("serie") || "9",
      aluno: { nome: cV("aluno-nome"), endereco: cV("endereco"), bairro: cV("bairro"), cidade: cV("cidade"), cep: cV("cep"), uf: cV("uf").toUpperCase() },
      resp: { nome: cV("nome"), nacionalidade: cV("nacionalidade"), cpf: cV("cpf"), rg: cV("rg"), rgOrgao: cV("rg-orgao"), rgData: cV("rg-data"), profissao: cV("profissao"), nasc: cV("nasc") },
      fin: { total: cV("total"), parcelas: cV("parcelas"), parcela: cV("parcela"), venc: cV("venc") },
    };
    abrirDocumento(docContratoHTML(d), "Contrato — " + d.aluno.nome, docNomeArquivo("Contrato", d.aluno.nome));
  } catch (err) {
    console.error(err);
    alert("Não consegui gerar o contrato: " + (err.message || err));
  }
}
wireCpfField("c-cpf", "c-cpf-hint");
ligarDica("c-rg", v => valRG(v, cV("cpf")));
ligarDica("c-nasc", v => valNascimento(v, "resp"));
ligarDica("c-rg-data", v => valExpedicao(v, cV("nasc")));
byId("c-cep").addEventListener("input", e => { const d = e.target.value.replace(/\D/g, "").slice(0, 8); e.target.value = d.length > 5 ? d.slice(0, 5) + "-" + d.slice(5) : d; });
byId("c-uf").addEventListener("input", e => { e.target.value = e.target.value.replace(/[^A-Za-z]/g, "").toUpperCase(); });
["c-total", "c-parcela"].forEach(id => byId(id).addEventListener("input", maskMoneyInput));
["c-total", "c-parcelas"].forEach(id => byId(id).addEventListener("blur", () => {
  const t = parseMoneyBR(cV("total")), n = parseInt(cV("parcelas"), 10);
  if (!cV("parcela").trim() && t > 0 && n > 0) cSet("parcela", formatMoneyBR(t / n));
}));
byId("c-carregar-btn").addEventListener("click", contratoCarregarAluno);
byId("c-busca").addEventListener("change", () => { if (students.some(x => normName(x.nome) === normName(cV("busca")))) contratoCarregarAluno(); });
byId("c-form-btn").addEventListener("click", contratoDoRequerimento);
byId("c-limpar-btn").addEventListener("click", contratoLimpar);
byId("gen-contrato-btn").addEventListener("click", gerarContrato);
document.querySelector('.nav-item[data-view="contrato"]').addEventListener("click", () => { contratoPopularLista(); if (!cV("data")) cSet("data", new Date().toISOString().slice(0, 10)); });

