window.addEventListener('load', () => {
  initDT(); // Initialize the DatatTable and window.columnNames variables

  Progress().hide();

  const repo = getRepoFromUrl();

  // const repo = getRepoFromUrl();
  if (repo) {
    document.getElementById('q').value = repo;
    fetchData();
  }
});

document.getElementById('form').addEventListener('submit', e => {
  e.preventDefault();
  fetchData();
});

function fetchData() {
  const repo = document.getElementById('q').value;
  const re = /[-_\w]+\/[-_.\w]+/;

  const urlRepo = getRepoFromUrl();

  if (!urlRepo || urlRepo !== repo) {
    window.history.pushState('', '', `#${repo}`);
  }

  if (re.test(repo)) {
    (async function () {
      await fetchAndShow(repo);
    })();
  } else {
    showMsg(
      'Invalid GitHub repository! Format is &lt;username&gt;/&lt;repo&gt;',
      'danger'
    );
  }
}

function updateDT(data) {
  // Remove any alerts, if any:
  if ($('.alert')) $('.alert').remove();

  // Format dataset and redraw DataTable. Use second index for key name
  const forks = [];
  for (let fork of data) {
    fork.repoLink = `<a href="https://github.com/${fork.full_name}">Link</a>`;
    fork.ownerName = fork.owner.login;
    forks.push(fork);
  }
  const dataSet = forks.map(fork =>
    window.columnNamesMap.map(colNM => fork[colNM[1]])
  );
  window.forkTable
    .clear()
    .rows.add(dataSet)
    .draw();

  $("[data-toggle=popover]").popover();
}

function initDT() {
  // Create ordered Object with column name and mapped display name
  window.columnNamesMap = [
    // [ 'Repository', 'full_name' ],
    ['Link', 'repoLink'], // custom key
    ['Owner', 'ownerName'], // custom key
    ['Name', 'name'],
    ['Branch', 'default_branch'],
    ['Stars', 'stargazers_count'],
    ['Forks', 'forks'],
    ['Open Issues', 'open_issues_count'],
    ['Size', 'size'],
    ['Last Push', 'pushed_at'],
    ['Diff Behind', 'diff_from_original'],
    ['Diff Ahead', 'diff_to_original'],
  ];

  // Sort by stars:
  const sortColName = 'Stars';
  const sortColumnIdx = window.columnNamesMap
    .map(pair => pair[0])
    .indexOf(sortColName);

  // Use first index for readable column name
  // we use moment's fromNow() if we are rendering for `pushed_at`; better solution welcome
  window.forkTable = $('#forkTable').DataTable({
    columns: window.columnNamesMap.map(colNM => {
      return {
        title: colNM[0],
        render:
          colNM[1] === 'pushed_at'
            ? (data, type, _row) => {
                if (type === 'display') {
                  return moment(data).format('YYYY-MM-DD');
                }
                return data;
              }
            : null,
      };
    }),
    order: [[sortColumnIdx, 'desc']],
  });
}

async function fetchAndShow(repo) {
  repo = repo.replace('https://github.com/', '');
  repo = repo.replace('http://github.com/', '');
  repo = repo.replace('.git', '');

  const token = document.getElementById('token').value;
  const api = Api(token);

  let data;
  try {
    data = await api.fetch(`https://api.github.com/repos/${repo}/forks?sort=stargazers&per_page=100`);

    await updateData(repo, data, api);
  } catch (error) {
    console.error(error);
  }

  try {
    updateDT(data);
  } catch (error) {
    console.error(error);
  }
}

function showMsg(msg, type) {
  let alert_type = 'alert-info';

  if (type === 'danger') {
    alert_type = 'alert-danger';
  }

  document.getElementById('footer').innerHTML = '';

  document.getElementById('data-body').innerHTML = `
        <div class="alert ${alert_type} alert-dismissible fade show" role="alert">
            <button type="button" class="close" data-dismiss="alert" aria-label="Close">
                <span aria-hidden="true">&times;</span>
            </button>
            ${msg}
        </div>
    `;
}

function getRepoFromUrl() {
  const urlRepo = location.hash && location.hash.slice(1);

  return urlRepo && decodeURIComponent(urlRepo);
}

async function updateData(repo, forks, api) {
  const originalBranch = 'master'; // TODO

  forks.forEach(fork => fork.diff_from_original = fork.diff_to_original = '');

  let index = 1;
  const progress = Progress(forks.length);
  progress.show();
  try {
    for (let fork of forks) {
      progress.update(index);
      await fetchMore(repo, originalBranch, fork, api);
      ++index;
    }
  } finally {
    progress.hide();
  }
}

async function fetchMore(repo, originalBranch, fork, api) {
  return Promise.all([
    fetchMoreDir(repo, originalBranch, fork, true, api),
    fetchMoreDir(repo, originalBranch, fork, false, api)
  ]);
}

async function fetchMoreDir(repo, originalBranch, fork, fromOriginal, api) {
  const url = fromOriginal
    ? `https://api.github.com/repos/${repo}/compare/${fork.owner.login}:${fork.default_branch}...${originalBranch}`
    : `https://api.github.com/repos/${repo}/compare/${originalBranch}...${fork.owner.login}:${fork.default_branch}`;

  const data = await api.fetch(url);

  if (fromOriginal)
    fork.diff_from_original = printInfo('-', data);
  else
    fork.diff_to_original = printInfo('+', data);
}

function printInfo(sep, data) {
  const length = data.commits.length;

  const details = '<pre>' +
    data.commits
      .map(c => {
        c.author_date = c.commit.author.date.replace('Z', '').replace('T', ' ');
        c.author_login = c.author ? c.author.login : '-';
        return c;
       })
      .map(c => `${c.sha.substr(0, 6)} ${c.author_date} ${c.author_login} (${c.commit.author.name}) - ${c.commit.message}`)
      .map(s => s.replace(/[\n\r]/g, ' ').substr(0, 150))
      .join('\n')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;') +
    '</pre>';

  return `<a tabindex="0" class="btn btn-sm" data-toggle="popover" data-trigger="focus" data-html="true" data-placement="bottom" title="Commits" data-content="${details}">${sep}${length}</a>`;
}

function Progress(max) {
  const $progress = $('.progress-bar');

  function show() { $progress.show(); }

  function hide() { $progress.hide(); }

  function update(count) {
    const val = Math.round((count / max) * 100) + '%';
    $progress.width(val);
    $progress.text(`${count} / ${max}`);
  }

  return { show, hide, update };
}

function Api(token) {
  const config = token
    ? {
      headers: {
        authorization: "token " + token
      }
    }
    : undefined;

  const rate = {
    remaining: null,
    limit: null,
    reset: null
  };

  async function get(url) {
    try {
      const response = await fetch(url, config);
      if (!response.ok)
        throw Error(response.statusText);

      rate.limit = response.headers.get('x-ratelimit-limit');
      rate.remaining = response.headers.get('x-ratelimit-remaining');
      rate.reset = new Date(1000 * parseInt(response.headers.get('x-ratelimit-reset')));

      const data = await response.json();
      return data;

    } catch (error) {
      const msg =
        error.toString().indexOf('Forbidden') >= 0
          ? 'Error: API Rate Limit Exceeded'
          : error;
      showMsg(`${msg}. Additional info in console`, 'danger');

      throw new Error(error);
    }
  }

  function getLimits() { return rate; }

  return { fetch: get, getLimits };
}
