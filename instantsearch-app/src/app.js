const { algoliasearch, instantsearch } = window;

const searchClient = algoliasearch(
  'P7HF5F7EEG',
  '85334946fb1fff4c0562f395d3c425a9'
);

const search = instantsearch({
  indexName: 'tasks',
  searchClient,
  future: { preserveSharedStateOnUnmount: true },
});

search.addWidgets([
  instantsearch.widgets.searchBox({
    container: '#searchbox',
  }),
  instantsearch.widgets.hits({
    container: '#hits',
    templates: {
      item: (hit, { html, components }) => html`
        <article>
          <div>
            <h1>${components.Highlight({ hit, attribute: 'propertyName' })}</h1>
            <p>${components.Highlight({ hit, attribute: 'updateType' })}</p>
          </div>
        </article>
      `,
    },
  }),
  instantsearch.widgets.configure({
    hitsPerPage: 8,
  }),
  instantsearch.widgets.pagination({
    container: '#pagination',
  }),
]);

search.start();
