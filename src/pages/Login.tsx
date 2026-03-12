import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ConfirmationResult, RecaptchaVerifier } from 'firebase/auth';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { auth } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BloodDropIcon } from '@/components/BloodDropIcon';
import { toast } from 'sonner';
import { Phone, ArrowLeft } from 'lucide-react';

const Login: React.FC = () => {
  const {
    signInWithGoogle,
    sendPhoneOTP,
    verifyPhoneOTP,
    signInWithEmailPassword,
    signUpWithEmailPassword,
    resetPassword,
  } = useAuth();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailMode, setEmailMode] = useState<'signin' | 'signup' | 'reset'>('signin');

  const [phoneNumber, setPhoneNumber] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [showOTPInput, setShowOTPInput] = useState(false);
  const recaptchaRef = useRef<HTMLDivElement>(null);
  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null);

  // Cleanup reCAPTCHA on unmount
  useEffect(() => {
    return () => {
      if (recaptchaVerifierRef.current) {
        recaptchaVerifierRef.current.clear();
        recaptchaVerifierRef.current = null;
      }
    };
  }, []);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      await signInWithGoogle();
      navigate('/');
    } catch (error: any) {
      console.error('Login error:', error);
      const host = window.location.hostname;
      if (error.code === 'auth/unauthorized-domain') {
        toast.error(
          `Unauthorized domain (${host}). Add it in Firebase Console → Authentication → Settings → Authorized domains.`
        );
      } else if (error.code === 'auth/configuration-not-found') {
        toast.error(
          'Google Sign-In not configured. Please enable it in Firebase Console → Authentication → Sign-in method → Google'
        );
      } else if (error.code === 'auth/popup-blocked') {
        toast.error('Popup blocked. Please allow popups and try again.');
      } else if (error.code === 'auth/popup-closed-by-user') {
        toast.error('Sign-in cancelled');
      } else {
        toast.error('Failed to sign in. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEmailAuth = async () => {
    if (!email) {
      toast.error('Please enter your email');
      return;
    }

    if (emailMode === 'reset') {
      setLoading(true);
      try {
        await resetPassword(email);
        toast.success('Password reset email sent! Check your inbox.');
        setEmailMode('signin');
      } catch (error: any) {
        console.error('Password reset error:', error);
        if (error.code === 'auth/user-not-found') {
          toast.error('No account found with this email');
        } else if (error.code === 'auth/invalid-email') {
          toast.error('Invalid email address');
        } else {
          toast.error('Failed to send reset email. Please try again.');
        }
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!password) {
      toast.error('Please enter your password');
      return;
    }

    setLoading(true);
    try {
      if (emailMode === 'signup') {
        await signUpWithEmailPassword(email, password);
        toast.success('Account created!');
      } else {
        await signInWithEmailPassword(email, password);
      }
      navigate('/');
    } catch (error: any) {
      console.error('Email auth error:', error);
      if (error.code === 'auth/invalid-email') {
        toast.error('Invalid email address');
      } else if (error.code === 'auth/email-already-in-use') {
        toast.error('This email is already in use');
      } else if (error.code === 'auth/weak-password') {
        toast.error('Password should be at least 6 characters');
      } else if (
        error.code === 'auth/user-not-found' ||
        error.code === 'auth/wrong-password' ||
        error.code === 'auth/invalid-credential'
      ) {
        toast.error('Incorrect email or password');
      } else {
        toast.error('Failed to sign in. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const setupRecaptcha = useCallback(() => {
    // Clear existing verifier
    if (recaptchaVerifierRef.current) {
      recaptchaVerifierRef.current.clear();
      recaptchaVerifierRef.current = null;
    }
    
    if (recaptchaRef.current) {
      // Clear any existing content
      recaptchaRef.current.innerHTML = '';
      
      recaptchaVerifierRef.current = new RecaptchaVerifier(auth, recaptchaRef.current, {
        size: 'invisible',
        callback: () => {
          // reCAPTCHA solved
        },
        'expired-callback': () => {
          toast.error('reCAPTCHA expired. Please try again.');
          setLoading(false);
        },
      });
    }
    return recaptchaVerifierRef.current;
  }, []);

  const handleSendOTP = async () => {
    if (!phoneNumber) {
      toast.error('Please enter a phone number');
      return;
    }

    // Format Bangladesh phone number
    let formattedPhone = phoneNumber.replace(/\s/g, '');
    if (formattedPhone.startsWith('0')) {
      formattedPhone = '+880' + formattedPhone.substring(1);
    } else if (!formattedPhone.startsWith('+')) {
      formattedPhone = '+880' + formattedPhone;
    }

    setLoading(true);
    try {
      const verifier = setupRecaptcha();
      if (!verifier) {
        toast.error('reCAPTCHA not loaded. Please refresh the page.');
        setLoading(false);
        return;
      }
      
      const result = await sendPhoneOTP(formattedPhone, verifier);
      setConfirmationResult(result);
      setShowOTPInput(true);
      toast.success('OTP sent to your phone');
    } catch (error: any) {
      console.error('OTP error:', error);
      const host = window.location.hostname;
      if (error.code === 'auth/billing-not-enabled') {
        toast.error('Phone authentication requires Firebase billing. Please use Email or Google sign-in.');
      } else if (error.code === 'auth/unauthorized-domain') {
        toast.error(
          `Unauthorized domain (${host}). Add it in Firebase Console → Authentication → Settings → Authorized domains.`
        );
      } else if (error.code === 'auth/operation-not-allowed') {
        toast.error('Phone sign-in is disabled. Enable it in Firebase Console → Authentication → Sign-in method → Phone');
      } else if (error.code === 'auth/invalid-phone-number') {
        toast.error('Invalid phone number format');
      } else if (error.code === 'auth/too-many-requests') {
        toast.error('Too many attempts. Please try again later.');
      } else if (error.message?.includes('reCAPTCHA')) {
        // Reset reCAPTCHA and try again
        setupRecaptcha();
        toast.error('reCAPTCHA error. Please try again.');
      } else {
        toast.error('Failed to send OTP. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (!otpCode || otpCode.length !== 6) {
      toast.error('Please enter a valid 6-digit OTP');
      return;
    }

    if (!confirmationResult) {
      toast.error('Please request OTP first');
      return;
    }

    setLoading(true);
    try {
      await verifyPhoneOTP(confirmationResult, otpCode);
      toast.success('Successfully signed in!');
      navigate('/');
    } catch (error: any) {
      console.error('Verification error:', error);
      if (error.code === 'auth/invalid-verification-code') {
        toast.error('Invalid OTP. Please check and try again.');
      } else {
        toast.error('Failed to verify OTP. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleBackToPhone = () => {
    setShowOTPInput(false);
    setOtpCode('');
    setConfirmationResult(null);
    // Reset reCAPTCHA for next attempt
    setupRecaptcha();
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Hero Section */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm space-y-8 animate-fade-in">
          {/* Logo & Title */}
          <div className="text-center space-y-4">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary/10 mb-4">
              <BloodDropIcon className="w-10 h-10 text-primary" />
            </div>
            <h1 className="text-3xl font-bold text-foreground">{t('login.title')}<span className="text-primary">?</span></h1>
            <p className="text-muted-foreground">
              {t('login.subtitle')}
            </p>
          </div>

          {/* Features */}
          <div className="space-y-3 py-4">
            <FeatureItem
              icon="🩸"
              title={t('login.feature1.title')}
              description={t('login.feature1.description')}
            />
            <FeatureItem
              icon="🚨"
              title={t('login.feature2.title')}
              description={t('login.feature2.description')}
            />
            <FeatureItem
              icon="📍"
              title={t('login.feature3.title')}
              description={t('login.feature3.description')}
            />
          </div>

          {/* Auth Tabs */}
          <Tabs defaultValue="google" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="google">{t('login.google')}</TabsTrigger>
              <TabsTrigger value="phone">{t('login.phone')}</TabsTrigger>
              <TabsTrigger value="email">{t('login.email')}</TabsTrigger>
            </TabsList>

            <TabsContent value="google" className="space-y-4 pt-4">
              <Button
                onClick={handleGoogleSignIn}
                disabled={loading}
                size="lg"
                className="w-full"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                    {t('auth.signingIn')}
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <GoogleIcon />
                    {t('auth.continueWithGoogle')}
                  </span>
                )}
              </Button>
            </TabsContent>

            <TabsContent value="phone" className="space-y-4 pt-4">
              {!showOTPInput ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="phone">{t('auth.phoneNumber')}</Label>
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="01XXXXXXXXX"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      disabled={loading}
                    />
                    <p className="text-xs text-muted-foreground">
                      {t('auth.enterBDPhone')}
                    </p>
                  </div>

                  <Button
                    onClick={handleSendOTP}
                    disabled={loading || !phoneNumber}
                    size="lg"
                    className="w-full"
                  >
                    {loading ? (
                      <span className="flex items-center gap-2">
                        <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                        {t('auth.sendingOTP')}
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <Phone className="w-4 h-4" />
                        {t('auth.sendOTP')}
                      </span>
                    )}
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleBackToPhone}
                    className="mb-2"
                  >
                    <ArrowLeft className="w-4 h-4 mr-1" />
                    {t('auth.changeNumber')}
                  </Button>

                  <div className="space-y-2">
                    <Label htmlFor="otp">{t('auth.enterOTP')}</Label>
                    <Input
                      id="otp"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      placeholder="000000"
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                      disabled={loading}
                      className="text-center text-2xl tracking-widest"
                    />
                    <p className="text-xs text-muted-foreground text-center">
                      {t('auth.otpSentTo')}: {phoneNumber}
                    </p>
                  </div>

                  <Button
                    onClick={handleVerifyOTP}
                    disabled={loading || otpCode.length !== 6}
                    size="lg"
                    className="w-full"
                  >
                    {loading ? (
                      <span className="flex items-center gap-2">
                        <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                        {t('auth.verifying')}
                      </span>
                    ) : (
                      t('auth.verifyAndSignIn')
                    )}
                  </Button>
                </div>
              )}
            </TabsContent>

            <TabsContent value="email" className="space-y-4 pt-4">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">{t('auth.email')}</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                  />
                </div>

                {emailMode !== 'reset' && (
                  <div className="space-y-2">
                    <Label htmlFor="password">{t('auth.password')}</Label>
                    <Input
                      id="password"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={loading}
                    />
                    <p className="text-xs text-muted-foreground">
                      {emailMode === 'signup' ? t('auth.passwordHint.signup') : t('auth.passwordHint.signin')}
                    </p>
                  </div>
                )}

                {emailMode === 'reset' && (
                  <p className="text-sm text-muted-foreground">
                    {t('auth.resetEmailInfo')}
                  </p>
                )}

                <Button
                  onClick={handleEmailAuth}
                  disabled={loading || !email || (emailMode !== 'reset' && !password)}
                  size="lg"
                  className="w-full"
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                      {emailMode === 'signup' ? t('auth.creating') : emailMode === 'reset' ? t('auth.sending') : t('auth.signingIn')}
                    </span>
                  ) : emailMode === 'signup' ? (
                    t('auth.createAccount')
                  ) : emailMode === 'reset' ? (
                    t('auth.sendResetLink')
                  ) : (
                    t('auth.signIn')
                  )}
                </Button>

                <div className="flex flex-col gap-1">
                  {emailMode === 'signin' && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setEmailMode('reset')}
                      className="w-full text-muted-foreground"
                    >
                      {t('auth.forgotPassword')}
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setEmailMode((m) => (m === 'signin' ? 'signup' : 'signin'))}
                    className="w-full"
                  >
                    {emailMode === 'signin' ? t('auth.noAccount') : emailMode === 'signup' ? t('auth.hasAccount') : t('common.back') + ' Sign in'}
                  </Button>
                </div>
              </div>
            </TabsContent>
          </Tabs>

          {/* reCAPTCHA container */}
          <div ref={recaptchaRef} id="recaptcha-container" />

          <p className="text-xs text-center text-muted-foreground">
            By continuing, you agree to help save lives through blood donation
          </p>
        </div>
      </div>

      {/* Footer */}
      <footer className="py-6 text-center text-sm text-muted-foreground">
        <p>{t('login.tagline')}</p>
      </footer>
    </div>
  );
};

const FeatureItem: React.FC<{ icon: string; title: string; description: string }> = ({
  icon,
  title,
  description,
}) => (
  <div className="flex items-start gap-3 p-3 rounded-lg bg-secondary/50">
    <span className="text-xl">{icon}</span>
    <div>
      <h3 className="font-medium text-foreground">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  </div>
);

const GoogleIcon: React.FC = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24">
    <path
      fill="currentColor"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
    />
    <path
      fill="currentColor"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <path
      fill="currentColor"
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
    />
    <path
      fill="currentColor"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
    />
  </svg>
);

export default Login;
