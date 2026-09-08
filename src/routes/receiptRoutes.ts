import { Router, Request, Response } from 'express';
import { receiptService } from '../services/receiptService';

const router = Router();

router.post('/send-email', async (req: Request, res: Response) => {
  try {
    const { transactionId, emailAddress } = req.body;
    
    if (!transactionId || !emailAddress) {
      return res.status(400).json({ error: 'transactionId and emailAddress are required' });
    }

    const result = await receiptService.sendViaEmail(transactionId, emailAddress);
    res.json({ success: true, receipt: result });
  } catch (error: any) {
    console.error('Email receipt error:', error);
    res.status(500).json({ error: error.message || 'Failed to send email receipt' });
  }
});

router.post('/send-sms', async (req: Request, res: Response) => {
  try {
    const { transactionId, phoneNumber } = req.body;
    
    if (!transactionId || !phoneNumber) {
      return res.status(400).json({ error: 'transactionId and phoneNumber are required' });
    }

    const result = await receiptService.sendViaSMS(transactionId, phoneNumber);
    res.json({ success: true, receipt: result });
  } catch (error: any) {
    console.error('SMS receipt error:', error);
    res.status(500).json({ error: error.message || 'Failed to send SMS receipt' });
  }
});

router.get('/:transactionId', async (req: Request, res: Response) => {
  try {
    const receipt = await receiptService.getReceipt(req.params.transactionId);
    if (!receipt) {
      return res.status(404).json({ error: 'Receipt not found' });
    }
    res.json(receipt);
  } catch (error: any) {
    console.error('Get receipt error:', error);
    res.status(500).json({ error: error.message || 'Failed to get receipt' });
  }
});

export default router;