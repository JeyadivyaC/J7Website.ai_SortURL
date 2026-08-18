import { mergeDestinationQuery } from '../../../src/short-url/query-merge';

describe('mergeDestinationQuery', () => {
  it('returns the destination unchanged when there is no incoming query string', () => {
    const result = mergeDestinationQuery('https://www.ippobill.com/msme/', '');

    expect(result).toBe('https://www.ippobill.com/msme/');
  });

  it('appends the incoming query params onto a destination with no query string of its own', () => {
    const result = mergeDestinationQuery(
      'https://www.ippobill.com/msme/',
      'utm_source=facebook&utm_medium=paid&utm_campaign=smallindustryday26&utm_content=feed_a',
    );

    expect(result).toBe(
      'https://www.ippobill.com/msme/?utm_source=facebook&utm_medium=paid&utm_campaign=smallindustryday26&utm_content=feed_a',
    );
  });

  it('overwrites a param already present on the destination with the incoming value', () => {
    const result = mergeDestinationQuery(
      'https://www.ippobill.com/msme/?utm_source=default',
      'utm_source=instagram',
    );

    expect(result).toBe('https://www.ippobill.com/msme/?utm_source=instagram');
  });

  it('keeps params from the destination that the incoming query string does not override', () => {
    const result = mergeDestinationQuery(
      'https://www.ippobill.com/msme/?utm_campaign=evergreen',
      'utm_source=facebook',
    );

    expect(result).toBe('https://www.ippobill.com/msme/?utm_campaign=evergreen&utm_source=facebook');
  });

  it('returns the destination unchanged when it is not a valid URL', () => {
    const result = mergeDestinationQuery('not-a-url', 'utm_source=facebook');

    expect(result).toBe('not-a-url');
  });
});
