import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BloodDropIcon } from '@/components/BloodDropIcon';
import { FileText, ChevronDown } from 'lucide-react';

interface TermsAndConditionsProps {
  onAccept: () => void;
  loading?: boolean;
}

const TERMS_VERSION = '2026-01-25';

export const TermsAndConditions: React.FC<TermsAndConditionsProps> = ({ onAccept, loading }) => {
  const [agreed, setAgreed] = useState(false);
  const [scrolledToBottom, setScrolledToBottom] = useState(false);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    const isAtBottom = target.scrollHeight - target.scrollTop <= target.clientHeight + 50;
    if (isAtBottom && !scrolledToBottom) {
      setScrolledToBottom(true);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8">
        <div className="w-full max-w-lg space-y-6 animate-fade-in">
          <div className="text-center space-y-3">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-2">
              <BloodDropIcon className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">Terms & Conditions</h1>
            <p className="text-sm text-muted-foreground">
              Please read and accept the terms to continue
            </p>
          </div>

          <Card className="border-2">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="w-5 h-5 text-primary" />
                RoktoLagbe Terms of Service
              </CardTitle>
              <p className="text-xs text-muted-foreground">Last Updated: {TERMS_VERSION}</p>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea 
                className="h-[400px] px-4 pb-4"
                onScrollCapture={handleScroll}
              >
                <div className="space-y-4 text-sm text-foreground/90 pr-4">
                  <p>
                    Welcome to RoktoLagbe, a platform designed to help connect blood donors and recipients during emergencies.
                  </p>
                  <p>By using this application, you agree to the following terms:</p>

                  <section className="space-y-2">
                    <h3 className="font-semibold text-primary">1. Purpose of the App</h3>
                    <p>
                      RoktoLagbe is a voluntary blood donation assistance platform. We do not guarantee donor availability, response time, or successful blood donation.
                    </p>
                  </section>

                  <section className="space-y-2">
                    <h3 className="font-semibold text-primary">2. User Responsibility</h3>
                    <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                      <li>Users must provide accurate and truthful information.</li>
                      <li>Any false requests, fake donor profiles, or misleading data are strictly prohibited.</li>
                      <li>Location sharing is optional and requires user consent.</li>
                    </ul>
                  </section>

                  <section className="space-y-2">
                    <h3 className="font-semibold text-primary">3. Location & Privacy</h3>
                    <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                      <li>Live location sharing happens only with explicit permission.</li>
                      <li>Users may accept or deny location sharing at any time.</li>
                      <li>RoktoLagbe does not track users without consent.</li>
                    </ul>
                  </section>

                  <section className="space-y-2">
                    <h3 className="font-semibold text-primary">4. Misuse & Fraud</h3>
                    <p>The following actions are considered misuse:</p>
                    <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                      <li>Fake blood requests</li>
                      <li>Harassment or abuse of donors or requesters</li>
                      <li>Scamming, misleading, or harmful behavior</li>
                      <li>Using the platform for non-medical or illegal purposes</li>
                    </ul>
                    <p className="mt-2">If misuse is detected:</p>
                    <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                      <li>Accounts may be suspended or permanently banned</li>
                      <li>Relevant data may be preserved</li>
                      <li>We may cooperate with law enforcement authorities if required by law</li>
                    </ul>
                  </section>

                  <section className="space-y-2">
                    <h3 className="font-semibold text-primary">5. No Medical Liability</h3>
                    <p>RoktoLagbe is not a medical service provider. We are not responsible for:</p>
                    <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                      <li>Medical outcomes</li>
                      <li>Donor health conditions</li>
                      <li>Hospital procedures</li>
                      <li>Any injury, loss, or damage resulting from blood donation</li>
                    </ul>
                  </section>

                  <section className="space-y-2">
                    <h3 className="font-semibold text-primary">6. Notifications & Communication</h3>
                    <p>By using this app, you agree to receive:</p>
                    <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                      <li>App notifications</li>
                      <li>Emergency alerts</li>
                      <li>Request-related messages</li>
                    </ul>
                    <p className="mt-1">You may control notification settings within the app.</p>
                  </section>

                  <section className="space-y-2">
                    <h3 className="font-semibold text-primary">7. Changes to Terms</h3>
                    <p>
                      These terms may be updated at any time. Continued use of the app means acceptance of updated terms.
                    </p>
                  </section>

                  <section className="space-y-2">
                    <h3 className="font-semibold text-primary">8. Contact</h3>
                    <p className="text-muted-foreground">
                      For concerns or reports, please contact us through the app.
                    </p>
                    <p className="text-muted-foreground">Location: Bangladesh</p>
                  </section>

                  <div className="h-4" />
                </div>
              </ScrollArea>
              
              {!scrolledToBottom && (
                <div className="flex items-center justify-center gap-1 py-2 text-xs text-muted-foreground bg-muted/50 border-t">
                  <ChevronDown className="w-4 h-4 animate-bounce" />
                  Scroll down to read all terms
                </div>
              )}
            </CardContent>
          </Card>

          <div className="space-y-4">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-secondary/50 border">
              <Checkbox
                id="terms"
                checked={agreed}
                onCheckedChange={(checked) => setAgreed(checked === true)}
                disabled={loading}
              />
              <label
                htmlFor="terms"
                className="text-sm cursor-pointer leading-relaxed"
              >
                I have read and agree to the <span className="font-medium text-primary">Terms & Conditions</span> of RoktoLagbe. I understand my responsibilities as a user.
              </label>
            </div>

            <Button
              onClick={onAccept}
              disabled={!agreed || loading}
              size="lg"
              className="w-full"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  Processing...
                </span>
              ) : (
                'Accept & Continue'
              )}
            </Button>
          </div>

          <p className="text-xs text-center text-muted-foreground">
            By accepting, you help us create a safer community for blood donors and recipients.
          </p>
        </div>
      </div>
    </div>
  );
};

export const TERMS_CURRENT_VERSION = TERMS_VERSION;

export default TermsAndConditions;
