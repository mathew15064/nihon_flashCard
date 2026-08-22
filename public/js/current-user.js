'use strict';

const CURRENT_USER_KEY = 'currentUserId';

const currentUser = {
  get() {
    return localStorage.getItem(CURRENT_USER_KEY);
  },
  set(id) {
    localStorage.setItem(CURRENT_USER_KEY, id);
  },
  clear() {
    localStorage.removeItem(CURRENT_USER_KEY);
  },
  validate() {
    const id = currentUser.get();
    if (!id) return $.Deferred().reject({ code: 'NO_USER' }).promise();
    return api.get(`/api/users/${id}`);
  }
};
