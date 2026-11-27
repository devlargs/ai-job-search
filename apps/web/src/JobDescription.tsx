/**
 * The one renderer of listing HTML (HTML convention). `html` is the API's
 * `descriptionHtml`, already passed through the server's allowlist sanitizer;
 * nothing else in the web app uses dangerouslySetInnerHTML.
 */
export function JobDescription({ html }: { html: string }) {
  return <div className="job-description" dangerouslySetInnerHTML={{ __html: html }} />;
}
