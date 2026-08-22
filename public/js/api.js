'use strict';

const api = {
  lastMeta: null,
  request(method, url, body) {
    return $.ajax({
      method,
      url,
      contentType: 'application/json',
      data: body ? JSON.stringify(body) : undefined,
      dataType: 'json'
    }).then(
      (res) => {
        if (res.success) {
          api.lastMeta = res.meta || null;
          return res.data;
        }
        return $.Deferred().reject(res.error).promise();
      },
      (xhr) => {
        const err = (xhr.responseJSON && xhr.responseJSON.error) || {
          code: 'NETWORK_ERROR',
          message: 'Request failed'
        };
        return $.Deferred().reject(err).promise();
      }
    );
  },
  get(url) {
    return api.request('GET', url);
  },
  post(url, body) {
    return api.request('POST', url, body);
  },
  put(url, body) {
    return api.request('PUT', url, body);
  },
  delete(url) {
    return api.request('DELETE', url);
  }
};
