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
              <p className="text-sm mb-6">
                <strong>Last Updated:</strong> November, 2025<br />
                <strong>Operated by:</strong> Cash Ridez Connect LLC, Atlanta, Georgia, USA
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
                1. Introduction
              </h2>
              <p className="mb-3">
                Welcome to CashRidez.com, a community platform that connects independent drivers and riders for the purpose of arranging transportation.
              </p>
              <p className="mb-3">
                By accessing or using CashRidez.com (the "Platform"), mobile versions, or related services (collectively, the "Service"), you agree to be bound by these Terms of Service ("Terms").
              </p>
              <p className="mb-3">
                If you do not agree, you must not use the Service.
              </p>
              <p>
                Cash Ridez Connect LLC ("CashRidez," "we," "us," or "our") may modify these Terms at any time. Updated versions will be posted on this page and are effective immediately when published.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
                2. Nature of the Service
              </h2>
              <p className="mb-3">
                CashRidez is a technology platform and not a transportation company, carrier, or employer.
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4 mb-3">
                <li>We do not own, operate, or control any vehicles.</li>
                <li>We do not screen or employ drivers.</li>
                <li>We do not guarantee ride quality, safety, punctuality, or pricing.</li>
              </ul>
              <p className="mb-3">
                Drivers and riders use the platform at their own risk.
              </p>
              <p>
                You acknowledge that CashRidez's role is limited to facilitating communication and transaction connections between independent users.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
                3. Eligibility
              </h2>
              <p className="mb-3">
                To use the Service, you must:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4 mb-3">
                <li>Be at least 18 years old.</li>
                <li>Have the legal capacity to enter into binding contracts.</li>
                <li>Comply with all applicable traffic, safety, and insurance laws in your jurisdiction.</li>
                <li>Not be suspended or removed from the platform.</li>
              </ul>
              <p>
                Drivers must possess a valid driver's license, vehicle registration, and insurance coverage required by law.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
                4. Account Registration
              </h2>
              <p className="mb-3">
                You must create an account to post or accept trips. You agree to:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4 mb-3">
                <li>Provide accurate and complete information.</li>
                <li>Maintain confidentiality of your login credentials.</li>
                <li>Accept responsibility for all activity that occurs under your account.</li>
              </ul>
              <p>
                We may suspend or terminate your account for violations of these Terms or applicable laws.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
                5. Independent Contractor Status
              </h2>
              <p className="mb-3">
                Drivers are independent contractors, not employees or agents of CashRidez.
              </p>
              <p className="mb-3">
                Nothing in these Terms creates an employment, agency, or joint-venture relationship.
              </p>
              <p className="mb-3">
                Drivers are solely responsible for:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Their tax obligations;</li>
                <li>Compliance with insurance and registration laws;</li>
                <li>Their conduct toward riders and third parties.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
                6. Payments and Fees
              </h2>
              <p className="mb-3">
                CashRidez does not process or collect payments between riders and drivers for rides.
              </p>
              <p className="mb-3">
                All trip-related payments, reimbursements, or exchanges occur directly between users, outside of the CashRidez platform.
              </p>
              <p className="mb-4">
                CashRidez's role is limited strictly to providing a communication and networking platform that allows verified users to connect, post, and coordinate ride opportunities within their community.
              </p>

              <h3 className="text-xl font-bold mb-3 text-gray-900 dark:text-white">
                Monthly Communication Fee
              </h3>
              <p className="mb-3">
                To maintain active access to the platform's communication features, users agree to pay a $9.99 monthly communication fee ("Membership Fee").
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4 mb-3">
                <li>This fee grants access to messaging, trip posting, and community interaction tools.</li>
                <li>The fee is non-refundable once billed, except where required by law.</li>
                <li>The subscription renews automatically each month unless canceled prior to the next billing cycle.</li>
                <li>Users may cancel their membership at any time through their account settings or by contacting CashRidez support at support@cashridez.com.</li>
              </ul>
              <p className="mb-4">
                CashRidez does not guarantee any specific number of connections, rides, or responses as part of the communication service.
              </p>

              <h3 className="text-xl font-bold mb-3 text-gray-900 dark:text-white">
                Third-Party Payment Processing
              </h3>
              <p className="mb-3">
                The Membership Fee is processed securely through third-party payment providers such as Stripe or similar services.
              </p>
              <p className="mb-3">
                By subscribing, you authorize CashRidez's payment processor to charge your designated payment method on a recurring basis.
              </p>
              <p className="mb-3">
                CashRidez does not store or have access to your full payment details.
              </p>
              <p className="mb-3">
                You acknowledge and agree that:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4 mb-4">
                <li>CashRidez is not a party to any financial or contractual agreement between users.</li>
                <li>CashRidez is not responsible for trip payments, disputes, refunds, or chargebacks between riders and drivers.</li>
              </ul>

              <h3 className="text-xl font-bold mb-3 text-gray-900 dark:text-white">
                Non-Payment
              </h3>
              <p>
                Failure to maintain an active subscription or valid payment method may result in suspension or termination of platform access.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
                7. User Conduct and Responsibilities
              </h2>
              <p className="mb-3">
                Users agree not to:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4 mb-3">
                <li>Use the Service for unlawful, fraudulent, or misleading activity.</li>
                <li>Harass, harm, or endanger any person.</li>
                <li>Post or share false, offensive, or defamatory content.</li>
                <li>Attempt to reverse engineer, hack, or disrupt the platform.</li>
              </ul>
              <p>
                Violations may result in account termination and potential legal action.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
                8. Driver and Rider Interactions
              </h2>
              <p className="mb-3">
                CashRidez does not control or guarantee:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4 mb-3">
                <li>The actions of drivers or riders;</li>
                <li>The condition or safety of vehicles;</li>
                <li>The accuracy of posted trip details;</li>
                <li>Completion of any ride.</li>
              </ul>
              <p>
                You are solely responsible for assessing the safety and legality of any ride arrangement.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
                9. Insurance and Risk Acknowledgment
              </h2>
              <p className="mb-3">
                Drivers are required to carry personal or commercial auto insurance meeting minimum legal requirements in their jurisdiction.
              </p>
              <p className="mb-3">
                CashRidez does not provide insurance coverage for any user.
              </p>
              <p>
                By using the platform, you understand and assume all risks associated with traveling or providing transportation arranged through the Service.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
                10. Disclaimers
              </h2>
              <p className="mb-3">
                The Service is provided "as is" and "as available."
              </p>
              <p className="mb-3">
                CashRidez disclaims all warranties, express or implied, including but not limited to:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Fitness for a particular purpose;</li>
                <li>Merchantability;</li>
                <li>Non-infringement;</li>
                <li>Accuracy or reliability of information.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
                11. Limitation of Liability
              </h2>
              <p className="mb-3">
                To the maximum extent permitted by law:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4 mb-3">
                <li>CashRidez and its owners, employees, and affiliates are not liable for any indirect, incidental, consequential, or punitive damages.</li>
                <li>Our total liability for any claim shall not exceed the amount you paid to CashRidez (if any) in the 12 months preceding the incident.</li>
              </ul>
              <p className="mb-3">
                You agree to release and hold harmless CashRidez from any claims arising from:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Accidents, injuries, or damages during a ride;</li>
                <li>Acts or omissions of drivers, riders, or third parties;</li>
                <li>Errors, bugs, or downtime of the platform.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
                12. Indemnification
              </h2>
              <p className="mb-3">
                You agree to indemnify and hold harmless CashRidez, its affiliates, and employees from any claims, damages, losses, liabilities, or expenses (including attorneys' fees) arising out of:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Your use of the Service;</li>
                <li>Your violation of these Terms or applicable law;</li>
                <li>Your interactions with other users.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
                13. Intellectual Property
              </h2>
              <p className="mb-3">
                All content, logos, designs, and software on CashRidez.com are owned by or licensed to Cash Ridez Connect LLC.
              </p>
              <p>
                You may not reproduce, distribute, or exploit any content without prior written permission.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
                14. Third-Party Links and Services
              </h2>
              <p className="mb-3">
                The platform may contain links to third-party sites (e.g., payment processors, insurance partners).
              </p>
              <p>
                We are not responsible for their content, security, or policies.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
                15. Dispute Resolution
              </h2>
              <h3 className="text-xl font-bold mb-3 text-gray-900 dark:text-white">
                a. Informal Resolution
              </h3>
              <p className="mb-4">
                You agree to first contact us at cashridezconnect@gmail.com to resolve disputes informally.
              </p>
              <h3 className="text-xl font-bold mb-3 text-gray-900 dark:text-white">
                b. Arbitration
              </h3>
              <p className="mb-3">
                Any unresolved dispute shall be settled by binding arbitration in Fulton County, Georgia, under the rules of the American Arbitration Association.
              </p>
              <p>
                You waive your right to a jury trial or class action.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
                16. Governing Law
              </h2>
              <p>
                These Terms are governed by the laws of the State of Georgia, without regard to conflict of law principles.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
                17. Termination
              </h2>
              <p className="mb-3">
                We may suspend or terminate your account at any time for violation of these Terms or at our discretion.
              </p>
              <p>
                Upon termination, your right to use the Service immediately ceases.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
                18. Severability
              </h2>
              <p>
                If any provision is found invalid or unenforceable, the remaining provisions shall continue in full effect.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
                19. Contact Information
              </h2>
              <p className="mb-3">
                For questions or notices, contact:
              </p>
              <p className="mb-1">
                <strong>Cash Ridez Connect LLC</strong>
              </p>
              <p className="mb-1">
                8735 Dunwoody Place, Suite R
              </p>
              <p className="mb-1">
                Atlanta, GA 30350
              </p>
              <p>
                📧 connect@cashridez.com
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
                20. Entire Agreement
              </h2>
              <p>
                These Terms constitute the complete agreement between you and CashRidez, superseding any prior agreements or representations.
              </p>
            </section>
          </div>
        </Card>
      </div>
    </div>
  );
}
