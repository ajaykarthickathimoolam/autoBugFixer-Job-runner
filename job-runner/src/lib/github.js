export function parseGithubRepo(repoUrl) {
  const sshMatch = repoUrl.match(/^git@github\.com:([^/]+)\/(.+?)(\.git)?$/);
  if (sshMatch) {
    return { owner: sshMatch[1], repo: sshMatch[2] };
  }
  const httpsMatch = repoUrl.match(/^https:\/\/github\.com\/([^/]+)\/(.+?)(\.git)?$/);
  if (httpsMatch) {
    return { owner: httpsMatch[1], repo: httpsMatch[2] };
  }
  throw new Error(`Unsupported GitHub repo URL: ${repoUrl}`);
}

export async function createPullRequest({ repoUrl, head, base, title, body, pat }) {
  const { owner, repo } = parseGithubRepo(repoUrl);
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${pat}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title, head, base, body }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`GitHub PR creation failed (${res.status}): ${data.message || JSON.stringify(data)}`);
  }
  return data.html_url;
}
