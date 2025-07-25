/**
 * 认证路由
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { JWT_SECRET } = require('../config/config');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

module.exports = router;

/**
 * 管理员登录
 */
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        // 验证输入
        if (!username || !password) {
            return res.status(400).json({ message: '请提供用户名和密码' });
        }
        
        // 查询管理员
        const [admins] = await pool.query('SELECT * FROM admins WHERE username = ?', [username]);
        
        if (admins.length === 0) {
            return res.status(401).json({ message: '用户名或密码错误' });
        }
        
        const admin = admins[0];
        
        // 验证密码
        const isPasswordValid = await bcrypt.compare(password, admin.password);
        console.log("debug"+isPasswordValid);
        
        if (!isPasswordValid) {
            return res.status(401).json({ message: '用户名或密码错误' });
        }
        
        // 创建管理员会话
        req.session.admin = {
            id: admin.id,
            username: admin.username,
            name: admin.name,
            email: admin.email
        };
        
        // 记录登录活动
        await pool.query(
            'INSERT INTO activities (type, description) VALUES (?, ?)',
            ['登录', `管理员 ${admin.username} 登录系统`]
        );
        
        // 返回管理员信息
        res.json({
            message: '登录成功',
            admin: req.session.admin
        });
    } catch (error) {
        console.error('登录失败:', error);
        res.status(500).json({ message: '登录失败: ' + error.message });
    }
});

/**
 * 获取当前管理员信息
 */
router.get('/me', authenticateToken, async (req, res) => {
    try {
        if (!req.session.admin) {
            return res.status(401).json({ message: '未登录或会话已过期' });
        }
        
        res.json({ admin: req.session.admin });
    } catch (error) {
        console.error('获取管理员信息失败:', error);
        res.status(500).json({ message: '获取管理员信息失败: ' + error.message });
    }
});

/**
 * 退出登录
 */
router.post('/logout', authenticateToken, (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('退出登录失败:', err);
            return res.status(500).json({ message: '退出登录失败' });
        }
        res.json({ message: '退出登录成功' });
    });
});

/**
 * 修改密码
 */
router.put('/password', authenticateToken, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        
        // 验证输入
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ message: '请提供当前密码和新密码' });
        }
        
        // 查询管理员
        const [admins] = await pool.query('SELECT * FROM admins WHERE id = ?', [req.user.id]);
        
        if (admins.length === 0) {
            return res.status(404).json({ message: '管理员不存在' });
        }
    
        const admin = admins[0];
        
        // 验证当前密码
        const isPasswordValid = await bcrypt.compare(currentPassword, admin.password);
        
        if (!isPasswordValid) {
            return res.status(401).json({ message: '当前密码错误' });
        }
        
        // 加密新密码
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);
        
        // 更新密码
        await pool.query('UPDATE admins SET password = ? WHERE id = ?', [hashedPassword, req.user.id]);
        
        // 记录密码修改活动
        await pool.query(
            'INSERT INTO activities (type, description) VALUES (?, ?)',
            ['密码修改', `管理员 ${admin.username} 修改了密码`]
        );
        
        res.json({ message: '密码修改成功' });
    } catch (error) {
        console.error('修改密码失败:', error);
        res.status(500).json({ message: '修改密码失败: ' + error.message });
    }
});