
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const { RouterOSClient } = require('routeros-client');

const app = express();
app.use(express.json());
app.use(cors());

// ==========================================
// ১. আপনার MikroTik Router Connection Config
// ==========================================
const mikrotikConfig = {
    host: '192.168.88.1', // আপনার মাইক্রোটিক এর IP Address
    user: 'admin_api',    // MikroTik API User
    password: '123456',   // MikroTik API Password
    port: 8728            // Default API Port
};

// ==========================================
// ২. কাস্টমার ডাটাবেজ (In-Memory Array)
// ==========================================
let customersList = [
    {
        id: 101,
        name: "রহিম আহমেদ",
        isp: "Dsr WiFi",
        username: "rahim_user",
        pass: "rahim123",
        mobile: "018XXXXXXXX",
        nid: "199826354129",
        pkg: "5 Mbps (500৳)",
        paid: true,
        status: "Active Line"
    },
    {
        id: 102,
        name: "সাব্বির হোসেন",
        isp: "Dsr WiFi",
        username: "sabbir_user",
        pass: "sabbir123",
        mobile: "017XXXXXXXX",
        nid: "199521369842",
        pkg: "10 Mbps (800৳)",
        paid: false,
        status: "Active Line"
    }
];

let paymentHistory = [
    { date: '02/09/26', name: 'রহিম আহমেদ', amount: 500, status: 'Done' }
];

// ==========================================
// ৩. MikroTik-এ PPPoE Secret Disable/Enable করার ফিকশন
// ==========================================
async function updateMikrotikStatus(username, disable) {
    const client = new RouterOSClient(mikrotikConfig);
    try {
        await client.connect();
        const api = await client.menu('/ppp/secret');
        
        // মাইক্রোটিকে ইউজার খোঁজা
        const users = await api.where('name', username).get();
        if (users.length > 0) {
            const id = users[0]['.id'];
            if (disable) {
                await api.where('.id', id).set({ disabled: 'true' });
                console.log(`[MikroTik] Line OFF for user: ${username}`);
            } else {
                await api.where('.id', id).set({ disabled: 'false' });
                console.log(`[MikroTik] Line ON for user: ${username}`);
            }
        } else {
            console.log(`[MikroTik Warning] User ${username} not found in router!`);
        }
        await client.close();
    } catch (err) {
        console.error('[MikroTik Connection Error]', err.message);
    }
}

// ==========================================
// ৪. Cron Job: প্রতি মাসের ৩ তারিখ রাত ১২টায় অটোমেটিক লাইন অফ হবে
// ==========================================
cron.schedule('0 0 3 * *', async () => {
    console.log('--- AUTO CUTTING UNPAID LINES (3rd of the month) ---');
    for (let cust of customersList) {
        if (!cust.paid) {
            cust.status = 'Disabled Line';
            await updateMikrotikStatus(cust.username, true); // Router-এ লাইন অফ
        }
    }
});

// ==========================================
// 5. REST API Endpoints (Frontend Communication)
// ==========================================

// সকল কাস্টমার ও বিলিং ডাটা পাওয়া
app.get('/api/data', (req, res) => {
    res.json({
        customers: customersList,
        payments: paymentHistory
    });
});

// নতুন কাস্টমার যুক্ত করা
app.post('/api/customers', (req, res) => {
    const newCust = {
        id: Math.floor(100 + Math.random() * 900),
        ...req.body,
        paid: true,
        status: 'Active Line'
    };
    customersList.push(newCust);
    res.json({ success: true, customer: newCust });
});

// ম্যানুয়ালি লাইন অন/অফ করা
app.post('/api/toggle-line', async (req, res) => {
    const { id, action } = req.body;
    const cust = customersList.find(c => c.id === id);
    if (cust) {
        cust.status = (action === 'off') ? 'Disabled Line' : 'Active Line';
        await updateMikrotikStatus(cust.username, action === 'off');
        res.json({ success: true, status: cust.status });
    } else {
        res.status(404).json({ error: 'Customer not found' });
    }
});

// পেমেন্ট রিসিভ ও মাইক্রোটিকে লাইন অটো-অন করা
app.post('/api/payments', async (req, res) => {
    const { customerId, date, amount } = req.body;
    const cust = customersList.find(c => c.id === parseInt(customerId));

    if (cust) {
        cust.paid = true;
        cust.status = 'Active Line';

        // MikroTik-এ লাইন চালু করা
        await updateMikrotikStatus(cust.username, false);

        const d = new Date(date);
        const formattedDate = `${d.getDate()}/${(d.getMonth()+1).toString().padStart(2, '0')}/${d.getFullYear().toString().slice(-2)}`;

        const payRecord = {
            date: formattedDate,
            name: cust.name,
            amount: parseInt(amount),
            status: 'Done'
        };
        paymentHistory.unshift(payRecord);

        res.json({ success: true, payment: payRecord });
    } else {
        res.status(404).json({ error: 'Customer not found' });
    }
});

app.listen(5000, () => console.log('🚀 Server is running on http://localhost:5000'));
