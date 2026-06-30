"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthController = void 0;
class AuthController {
    login(req, res) { res.render('login'); }
    authenticate(req, res) { }
    logout(req, res) { }
}
exports.AuthController = AuthController;
