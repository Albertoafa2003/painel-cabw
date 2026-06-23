# Painel CABW

Sistema web desenvolvido para apoiar a gestão, o controle interno e o acompanhamento gerencial da Comissão Aeronáutica Brasileira em Washington — CABW.

O projeto reúne, em uma interface única, painéis de informações sobre crédito disponível, contratos, processos de contratação, requisições, governança, restos a pagar e indicadores consolidados da organização.

## Visão Geral

O **Painel CABW** tem como objetivo facilitar a visualização de dados estratégicos e operacionais, permitindo uma tomada de decisão mais rápida, transparente e fundamentada.

A aplicação foi desenvolvida como site estático, compatível com publicação via **GitHub Pages**, utilizando HTML, CSS e JavaScript.

## Principais Funcionalidades

- Tela inicial de login com validação de e-mail institucional `@fab.mil.br`;
- Interface para criação de conta;
- Página principal com acesso aos módulos gerenciais;
- Painel de Crédito Disponível;
- Análise por Unidade Gestora;
- Análise por Ação Orçamentária;
- Detalhamento analítico com filtros;
- Geração de relatórios em PDF;
- Painéis de Contratos Administrativos, Finalísticos e FMS;
- Filtros por empresa, vigência, Grande Comando e Ordenador de Despesas;
- Painel de Governança;
- Controle de Restos a Pagar;
- CABW em Números;
- Painéis de Processos de Contratação;
- Acompanhamento do processo de Seguro Saúde;
- Administração do Sistema com usuários cadastrados e histórico de acesso.

## Estrutura do Projeto

```text
/
├── index.html
├── cadastro.html
├── painel.html
├── credito.html
├── ug.html
├── action.html
├── detail.html
├── contratos.html
├── contratos-administrativos.html
├── contratos-finalisticos.html
├── fms.html
├── processos.html
├── processos-administrativos.html
├── processos-finalisticos.html
├── processos-seguro-saude.html
├── governanca.html
├── governanca-rp.html
├── governanca-cabw-numeros.html
├── administracao.html
├── admin-usuarios.html
├── admin-historico.html
├── css/
│   └── style.css
├── assets/
│   ├── data/
│   ├── icons/
│   ├── img/
│   └── js/
└── README.md
Tecnologias Utilizadas
HTML5
CSS3
JavaScript
Bootstrap
Bootstrap Icons
GitHub Pages
LocalStorage para controle local de sessão, usuários e histórico
