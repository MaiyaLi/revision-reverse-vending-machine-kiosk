import express, { Router, Request, Response, NextFunction } from 'express';
import { userService, UserRegistrationInput, UserLoginInput } from '../services/userService';

// ============================================
// TYPES & MIDDLEWARE
// ============================================

interface AuthRequest extends Request {
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
}

// ============================================
// MIDDLEWARE
// ============================================

/**
 * Capture request metadata (IP, User Agent)
 */
const captureMetadata = (req: AuthRequest, res: Response, next: NextFunction) => {
  req.ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
  req.userAgent = req.headers['user-agent'] || 'unknown';
  next();
};

/**
 * Validate request body has required fields
 */
const validateRequestBody = (requiredFields: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const missingFields = requiredFields.filter(field => !req.body[field]);

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Missing required fields: ${missingFields.join(', ')}`
      });
    }

    next();
  };
};

/**
 * Error handler wrapper for async routes
 */
const asyncHandler = (fn: Function) => (req: Request, res: Response, next: NextFunction) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// ============================================
// ROUTER SETUP
// ============================================

const router = Router();
router.use(captureMetadata);
router.use(express.json());

// ============================================
// USER REGISTRATION ENDPOINTS
// ============================================

/**
 * POST /api/user/register
 * Register a new user or link phone number to existing session
 */
router.post(
  '/register',
  validateRequestBody(['memberId', 'name']),
  asyncHandler(async (req: AuthRequest, res: Response) => {
      const { memberId, fullName, phoneNumber, email, pinCode } = req.body;

      try {
        // Validate input format
        if (memberId.length < 3 || memberId.length > 50) {
          return res.status(400).json({
            success: false,
            error: 'Member ID must be between 3 and 50 characters'
          });
        }

        if (fullName.length < 2 || fullName.length > 255) {
          return res.status(400).json({
            success: false,
            error: 'Name must be between 2 and 255 characters'
          });
        }

        // Register user
        const registrationInput: UserRegistrationInput = {
          memberId,
          fullName,
          phoneNumber,
          emailAddress: email,
          pinCode
        };

      const userProfile = await userService.registerUser(registrationInput);

      return res.status(201).json({
        success: true,
        message: 'User registered successfully',
        data: userProfile
      });
    } catch (error: any) {
      console.error('Registration error:', error);

      // Check for specific error types
      if (error.message.includes('already exists')) {
        return res.status(409).json({
          success: false,
          error: 'User with this member ID, phone number, or email already exists'
        });
      }

      return res.status(400).json({
        success: false,
        error: error.message || 'Registration failed'
      });
    }
  })
);

/**
 * POST /api/user/verify-pin
 * Authenticate user with PIN code
 */
router.post(
  '/verify-pin',
  validateRequestBody(['credential', 'pinCode']),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { credential, pinCode } = req.body;

    try {
      // Find user by credential
      const user = await userService.findUserByCredential(credential);

      if (!user) {
        return res.status(401).json({
          success: false,
          error: 'User not found'
        });
      }

      if (!user.isActive) {
        return res.status(403).json({
          success: false,
          error: 'User account is deactivated'
        });
      }

      // Verify PIN
      const isPinValid = await userService.verifyPin(user.id, pinCode);

      if (!isPinValid) {
        return res.status(401).json({
          success: false,
          error: 'Invalid PIN code'
        });
      }

      // Get updated user profile
      const userProfile = await userService.getUserProfile(user.id);

      return res.status(200).json({
        success: true,
        message: 'PIN verified successfully',
        data: {
          user: userProfile,
          sessionToken: `${user.id}-${Date.now()}` // Simple token for demo
        }
      });
    } catch (error: any) {
      console.error('PIN verification error:', error);

      return res.status(400).json({
        success: false,
        error: error.message || 'PIN verification failed'
      });
    }
  })
);

// ============================================
// USER PROFILE ENDPOINTS
// ============================================

/**
 * GET /api/user/:memberId
 * Fetch user profile with balance and stats
 */
router.get(
  '/:memberId',
  asyncHandler(async (req: Request, res: Response) => {
    const { memberId } = req.params;

    try {
      // Find user by member ID
      const user = await userService.findUserByCredential(memberId);

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      // Get user profile with stats
      const userWithStats = await userService.getUserWithStats(user.id);

      return res.status(200).json({
        success: true,
        data: userWithStats
      });
    } catch (error: any) {
      console.error('Error fetching user profile:', error);

      return res.status(500).json({
        success: false,
        error: 'Failed to fetch user profile'
      });
    }
  })
);

/**
 * GET /api/user/:memberId/profile
 * Fetch user profile (minimal)
 */
router.get(
  '/:memberId/profile',
  asyncHandler(async (req: Request, res: Response) => {
    const { memberId } = req.params;

    try {
      const user = await userService.findUserByCredential(memberId);

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      const userProfile = await userService.getUserProfile(user.id);

      return res.status(200).json({
        success: true,
        data: userProfile
      });
    } catch (error: any) {
      console.error('Error fetching user profile:', error);

      return res.status(500).json({
        success: false,
        error: 'Failed to fetch user profile'
      });
    }
  })
);

/**
 * GET /api/user/:memberId/stats
 * Fetch user statistics and metrics
 */
router.get(
  '/:memberId/stats',
  asyncHandler(async (req: Request, res: Response) => {
    const { memberId } = req.params;

    try {
      const user = await userService.findUserByCredential(memberId);

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      const stats = await userService.getUserStats(user.id);

      return res.status(200).json({
        success: true,
        data: stats
      });
    } catch (error: any) {
      console.error('Error fetching user stats:', error);

      return res.status(500).json({
        success: false,
        error: 'Failed to fetch user statistics'
      });
    }
  })
);

// ============================================
// TRANSACTION HISTORY ENDPOINTS
// ============================================

/**
 * GET /api/user/:memberId/history
 * Fetch paginated transaction and payout history
 */
router.get(
  '/:memberId/history',
  asyncHandler(async (req: Request, res: Response) => {
    const { memberId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = Math.min(parseInt(req.query.pageSize as string) || 20, 100);

    try {
      // Validate pagination params
      if (page < 1) {
        return res.status(400).json({
          success: false,
          error: 'Page must be greater than 0'
        });
      }

      if (pageSize < 1 || pageSize > 100) {
        return res.status(400).json({
          success: false,
          error: 'Page size must be between 1 and 100'
        });
      }

      // Find user
      const user = await userService.findUserByCredential(memberId);

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      // Get transaction history
      const history = await userService.getTransactionHistory(user.id, page, pageSize);

      return res.status(200).json({
        success: true,
        data: history,
        pagination: {
          page,
          pageSize,
          hasMore: history.hasMore,
          totalCount: history.totalCount
        }
      });
    } catch (error: any) {
      console.error('Error fetching transaction history:', error);

      return res.status(500).json({
        success: false,
        error: 'Failed to fetch transaction history'
      });
    }
  })
);

/**
 * GET /api/user/:memberId/deposits
 * Fetch deposit history
 */
router.get(
  '/:memberId/deposits',
  asyncHandler(async (req: Request, res: Response) => {
    const { memberId } = req.params;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

    try {
      const user = await userService.findUserByCredential(memberId);

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      const deposits = await userService.getDepositHistory(user.id, limit);

      return res.status(200).json({
        success: true,
        data: deposits,
        count: deposits.length
      });
    } catch (error: any) {
      console.error('Error fetching deposit history:', error);

      return res.status(500).json({
        success: false,
        error: 'Failed to fetch deposit history'
      });
    }
  })
);

// ============================================
// ACCOUNT MANAGEMENT ENDPOINTS
// ============================================

/**
 * POST /api/user/:memberId/update-pin
 * Update user PIN code
 */
router.post(
  '/:memberId/update-pin',
  validateRequestBody(['currentPin', 'newPin']),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { memberId } = req.params;
    const { currentPin, newPin } = req.body;

    try {
      // Find user
      const user = await userService.findUserByCredential(memberId);

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      // Verify current PIN
      const isCurrentPinValid = await userService.verifyPin(user.id, currentPin);

      if (!isCurrentPinValid) {
        return res.status(401).json({
          success: false,
          error: 'Current PIN is incorrect'
        });
      }

      // Update PIN
      await userService.updatePinCode(user.id, newPin);

      return res.status(200).json({
        success: true,
        message: 'PIN code updated successfully'
      });
    } catch (error: any) {
      console.error('Error updating PIN code:', error);

      return res.status(400).json({
        success: false,
        error: error.message || 'Failed to update PIN code'
      });
    }
  })
);

/**
 * POST /api/user/:memberId/deactivate
 * Deactivate user account
 */
router.post(
  '/:memberId/deactivate',
  validateRequestBody(['pin']),
  asyncHandler(async (req: Request, res: Response) => {
    const { memberId } = req.params;
    const { pin } = req.body;

    try {
      const user = await userService.findUserByCredential(memberId);

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      // Verify PIN before deactivation
      const isPinValid = await userService.verifyPin(user.id, pin);

      if (!isPinValid) {
        return res.status(401).json({
          success: false,
          error: 'Invalid PIN code'
        });
      }

      // Deactivate user
      await userService.deactivateUser(user.id);

      return res.status(200).json({
        success: true,
        message: 'Account deactivated successfully'
      });
    } catch (error: any) {
      console.error('Error deactivating account:', error);

      return res.status(500).json({
        success: false,
        error: 'Failed to deactivate account'
      });
    }
  })
);

/**
 * POST /api/user/:memberId/reactivate
 * Reactivate user account
 */
router.post(
  '/:memberId/reactivate',
  validateRequestBody(['pin']),
  asyncHandler(async (req: Request, res: Response) => {
    const { memberId } = req.params;
    const { pin } = req.body;

    try {
      const user = await userService.findUserByCredential(memberId);

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      if (!user.pinCodeHash) {
        return res.status(400).json({
          success: false,
          error: 'User account does not have PIN code set'
        });
      }

      // Verify PIN before reactivation
      const isPinValid = await userService.verifyPin(user.id, pin);

      if (!isPinValid) {
        return res.status(401).json({
          success: false,
          error: 'Invalid PIN code'
        });
      }

      // Reactivate user
      await userService.reactivateUser(user.id);

      return res.status(200).json({
        success: true,
        message: 'Account reactivated successfully'
      });
    } catch (error: any) {
      console.error('Error reactivating account:', error);

      return res.status(500).json({
        success: false,
        error: 'Failed to reactivate account'
      });
    }
  })
);

// ============================================
// HEALTH CHECK & INFO ENDPOINTS
// ============================================

/**
 * GET /api/user/health
 * Health check for user service
 */
router.get('/health/check', async (req: Request, res: Response) => {
  return res.status(200).json({
    success: true,
    status: 'User service is healthy',
    timestamp: new Date().toISOString()
  });
});

// ============================================
// ERROR HANDLING MIDDLEWARE
// ============================================

/**
 * 404 handler for user routes
 */
router.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'User endpoint not found'
  });
});

/**
 * Global error handler
 */
router.use((error: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled error:', error);

  return res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
});

export default router;
