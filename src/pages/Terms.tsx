import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function Terms() {
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
            Terms of Service
          </h1>

          <div className="space-y-6 text-gray-700 dark:text-gray-300">
            <section>
              <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
                1. Platform Overview
              </h2>
              <p>
                CashRidez is a communication and networking platform designed to connect individuals for travel coordination. CashRidez does not arrange, control, or provide transportation services and is not responsible for user transactions or travel outcomes.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
                2. User Responsibilities
              </h2>
              <p className="mb-3">
                By using CashRidez, you acknowledge that:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>You are solely responsible for all interactions and transactions with other users</li>
                <li>CashRidez facilitates connections only and does not provide transportation services</li>
                <li>You must verify the identity and credentials of other users before engaging in any transaction</li>
                <li>You agree to maintain accurate and current account information</li>
                <li>You will comply with all applicable laws and regulations</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
                3. ID Verification
              </h2>
              <p>
                All users must complete our ID verification process to access platform features. This helps maintain a trusted community but does not guarantee the safety or reliability of any user or transaction.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
                4. Payment and Pricing
              </h2>
              <p>
                Riders set prices for their trip postings. Drivers can accept posted trips or submit counter offers. All payment arrangements are made directly between users. CashRidez does not process, facilitate, or take commission on any payments between users.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
                5. Ratings and Reviews
              </h2>
              <p>
                Users can rate each other after completed trips. Maintaining excellent ratings may qualify you for weekly prizes and exclusive giveaways. Ratings are based on user feedback and do not constitute endorsements by CashRidez.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
                6. Limitation of Liability
              </h2>
              <p>
                CashRidez is not liable for any damages, injuries, losses, or disputes arising from user interactions or transactions. Users engage with each other at their own risk.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
                7. Account Termination
              </h2>
              <p>
                CashRidez reserves the right to suspend or terminate accounts that violate these terms or engage in fraudulent, harmful, or inappropriate behavior.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
                8. Changes to Terms
              </h2>
              <p>
                CashRidez may update these terms at any time. Continued use of the platform constitutes acceptance of updated terms.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
                9. Contact
              </h2>
              <p>
                For questions about these terms, please contact our support team through the platform.
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
