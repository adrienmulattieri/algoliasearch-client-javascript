import { MethodEnum, Request } from '@algolia/requester-common';
import fetchMock from 'jest-fetch-mock';
fetchMock.enableMocks();

import { createBrowserFetchRequester } from '../..';

const requester = createBrowserFetchRequester();

const requestStub = {
  url: 'https://algolia-dns.net/foo?x-algolia-header=bar',
  method: MethodEnum.Post,
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
  },
  data: JSON.stringify({ foo: 'bar' }),
  responseTimeout: 1,
  connectTimeout: 2,
};

const timeoutRequest: Request = {
  url: 'missing-url-here',
  data: '',
  headers: {},
  method: 'GET',
  responseTimeout: 2,
  connectTimeout: 1,
};

describe('status code handling', () => {
  beforeEach(() => fetchMock.resetMocks());
  it('sends requests', async () => {
    expect.assertions(3);
    fetchMock.mockResponseOnce(JSON.stringify({ foo: 'bar' }));
    const res = await requester.send(requestStub);
    expect(res).toEqual({
      content: '{"foo":"bar"}',
      status: 200,
      isTimedOut: false,
    });
    expect(fetchMock.mock.calls[0][0]).toEqual('https://algolia-dns.net/foo?x-algolia-header=bar');
    expect(fetchMock.mock.calls[0][1]).toEqual({
      method: MethodEnum.Post,
      signal: new AbortController().signal,
      headers: new Headers({
        'Content-Type': 'application/x-www-form-urlencoded',
      }),
    });
  });
  it('resolves status 300', async () => {
    fetchMock.mockResponseOnce('', {
      status: 300,
    });
    const res = await requester.send(requestStub);
    expect(res).toEqual({
      content: '',
      status: 300,
      isTimedOut: false,
    });
  });
  it('resolves status 400', async () => {
    const body = { message: 'Invalid Application-Id or API-Key' };
    fetchMock.mockResponseOnce(JSON.stringify(body), {
      status: 400,
    });
    const res = await requester.send(requestStub);
    expect(res).toEqual({
      content: JSON.stringify(body),
      status: 400,
      isTimedOut: false,
    });
  });
  it('handles the protocol', async () => {
    const body = JSON.stringify({ foo: 'bar' });
    fetchMock.mockResponseOnce(JSON.stringify(body), {
      status: 200,
    });
    const res = await requester.send({
      ...requestStub,
      url: 'http://localhost',
    });
    expect(res).toEqual({
      content: JSON.stringify(body),
      status: 200,
      isTimedOut: false,
    });
  });
});

describe('timeout handling', () => {
  beforeEach(() => fetchMock.resetMocks());
  it('request timeouts with the given 3 seconds connection timeout', async () => {
    const before = Date.now();
    fetchMock.mockResponseOnce(
      () => new Promise(resolve => setTimeout(() => resolve({ body: 'ok' }), 3000))
    );
    const response = await requester.send({
      ...timeoutRequest,
      ...{ connectTimeout: 1, responseTimeout: 1, url: 'http://www.google.com:81' },
    });
    const now = Date.now();
    expect(response).toEqual({
      content: 'Request timeout',
      status: 0,
      isTimedOut: true,
    });
    expect(now - before).toBeGreaterThan(2990);
    expect(now - before).toBeLessThan(3200);
  });
  it('do not timeouts if response appears before the timeout', async () => {
    const before = Date.now();
    fetchMock.mockResponseOnce(
      () => new Promise(resolve => setTimeout(() => resolve({ body: 'ok' }), 3000))
    );
    const response = await requester.send({
      ...timeoutRequest,
      ...{ connectTimeout: 6, responseTimeout: 1, url: 'http://www.google.com:81' },
    });
    const now = Date.now();
    expect(response).toEqual({
      content: 'ok',
      status: 200,
      isTimedOut: false,
    });
    expect(now - before).toBeGreaterThan(2990);
    expect(now - before).toBeLessThan(3200);
  });
});

describe('error handling', () => {
  beforeEach(() => {
    fetchMock.resetMocks();
  });
  it('resolves dns not found', async () => {
    fetchMock.dontMock();
    const request = {
      url: 'https://this-dont-exist.algolia.com',
      method: MethodEnum.Post,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      data: JSON.stringify({ foo: 'bar' }),
      responseTimeout: 2,
      connectTimeout: 1,
    };
    const response = await requester.send(request);
    expect(response.status).toBe(0);
    expect(response.content).toBe('Network request failed');
    expect(response.isTimedOut).toBe(false);
  });

  it('resolves general network errors', async () => {
    fetchMock.mockResponseOnce(() => Promise.reject(new Error('This is a general error')));
    const response = await requester.send(requestStub);
    expect(response.status).toBe(0);
    expect(response.content).toBe('Network request failed');
    expect(response.isTimedOut).toBe(false);
  });
});
