import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function Privacy() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-gray-50 to-white dark:from-black dark:via-gray-950 dark:to-black">
      <div className="container mx-auto px-4 py-12">
        <Button
          variant="ghost"
          className="mb-6"
          onClick={() => navigate("/")}
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Home
        </Button>

        <Card className="p-8 max-w-4xl mx-auto bg-white dark:bg-gray-900 border border-yellow-500/20">
          <h1 className="text-4xl font-bold mb-8 bg-gradient-to-r from-yellow-400 to-emerald-500 bg-clip-text text-transparent">
            Privacy Policy
          </h1>

          <div className="space-y-6 text-gray-700 dark:text-gray-300">
            <section>
              <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
                1. Information We Collect
              </h2>
              <p className="mb-3">
                CashRidez collects the following information to provide and improve our services:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li><strong>Account Information:</strong> Name, email address, phone number, and profile photo</li>
                <li><strong>ID Verification:</strong> Government-issued ID photos for verification purposes</li>
                <li><strong>Location Data:</strong> Pickup and drop-off locations for trip coordination</li>
                <li><strong>Trip Information:</strong> Trip details, ratings, and communication history</li>
                <li><strong>Device Information:</strong> Device type, browser type, and IP address</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
                2. How We Use Your Information
              </h2>
              <p className="mb-3">
                Your information is used to:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Facilitate connections between riders and drivers</li>
                <li>Verify user identities for platform safety</li>
                <li>Enable communication between users for trip coordination</li>
                <li>Process ratings and reviews</li>
                <li>Improve platform features and user experience</li>
                <li>Send important notifications about your trips and account</li>
                <li>Prevent fraud and maintain platform security</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
                3. Information Sharing
              </h2>
              <p className="mb-3">
                We share your information only in the following circumstances:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li><strong>With Other Users:</strong> Your name, profile photo, and ratings are visible to users you connect with</li>
                <li><strong>Legal Requirements:</strong> When required by law or to protect our legal rights</li>
                <li><strong>Service Providers:</strong> With trusted third-party services that help us operate the platform</li>
              </ul>
              <p className="mt-3">
                <strong>Important:</strong> Your contact information (email, phone number) remains private and is not shared with other users unless you choose to share it directly.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
                4. Data Security
              </h2>
              <p>
                We implement industry-standard security measures to protect your personal information. However, no method of transmission over the internet is 100% secure, and we cannot guarantee absolute security.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
                5. ID Verification Data
              </h2>
              <p>
                ID verification photos are securely stored and used solely for verification purposes. This data is encrypted and accessible only to authorized verification personnel.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
                6. Location Data
              </h2>
              <p>
                Location data is used only to facilitate trip connections and is shared with other users only when you post or accept a trip. You can control location sharing through your device settings.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
                7. Your Rights
              </h2>
              <p className="mb-3">
                You have the right to:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Access your personal information</li>
                <li>Correct inaccurate information</li>
                <li>Request deletion of your account and data</li>
                <li>Opt out of non-essential communications</li>
                <li>Export your data</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
                8. Data Retention
              </h2>
              <p>
                We retain your information for as long as your account is active or as needed to provide services. After account deletion, we may retain certain information as required by law or for legitimate business purposes.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
                9. Children's Privacy
              </h2>
              <p>
                CashRidez is not intended for users under 18 years of age. We do not knowingly collect information from children.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
                10. Changes to This Policy
              </h2>
              <p>
                We may update this privacy policy from time to time. We will notify you of significant changes through the platform or via email.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
                11. Contact Us
              </h2>
              <p>
                For privacy-related questions or to exercise your rights, please contact our support team through the platform.
              </p>
            </section>
          </div>

          <div className="mt-8 pt-8 border-t border-yellow-500/20">
            <p className="text-sm text-gray-600 dark:text-gray-500 text-center">
              Last Updated: January 2025
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
