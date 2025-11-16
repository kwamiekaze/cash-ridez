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
              <p className="text-sm mb-6">
                <strong>Last Updated:</strong> November, 2025<br />
                <strong>Operated by:</strong> Cash Ridez Connect LLC, Atlanta, Georgia, USA
              </p>
            </section>

            <section>
              <p className="mb-3">
                This Privacy Policy explains how CashRidez.com collects, uses, protects, and shares your information.
                By using the platform, you agree to the practices described in this Privacy Policy.
              </p>
              <p className="mb-3">
                CashRidez may update this policy at any time. Continued use of the platform means you accept the updated policy.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
                1. Information We Collect
              </h2>
              <p className="mb-3">
                CashRidez collects only the information necessary to operate a safe community communication platform. We do not sell user data.
              </p>
              
              <h3 className="text-xl font-semibold mb-3 text-gray-900 dark:text-white">A. Information You Provide</h3>
              <p className="mb-2">When you create an account or update your profile, you may provide:</p>
              <ul className="list-disc list-inside space-y-2 ml-4 mb-4">
                <li>Name</li>
                <li>Email address</li>
                <li>Phone number</li>
                <li>Communication preferences</li>
                <li>Profile photo (if uploaded)</li>
                <li>Vehicle details (if posted voluntarily by drivers)</li>
                <li>Trip information you choose to post, such as origin, destination, date, and time</li>
              </ul>

              <h3 className="text-xl font-semibold mb-3 text-gray-900 dark:text-white">B. Identity Verification</h3>
              <p className="mb-2">To maintain a safe community, we may request ID verification. This may include:</p>
              <ul className="list-disc list-inside space-y-2 ml-4 mb-4">
                <li>Driver license photo</li>
                <li>Selfie verification</li>
                <li>Other identification information as required by our verification partners</li>
              </ul>

              <h3 className="text-xl font-semibold mb-3 text-gray-900 dark:text-white">C. Payment Information</h3>
              <p className="mb-2">
                CashRidez charges a monthly communication fee processed through Stripe or similar third-party providers.
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4 mb-4">
                <li>We do not store full credit card or payment details</li>
                <li>Stripe securely processes and stores payment data under its own Privacy Policy</li>
              </ul>

              <h3 className="text-xl font-semibold mb-3 text-gray-900 dark:text-white">D. Automatically Collected Information</h3>
              <p className="mb-2">We may collect data such as:</p>
              <ul className="list-disc list-inside space-y-2 ml-4 mb-4">
                <li>Device type</li>
                <li>Browser type</li>
                <li>IP address</li>
                <li>Pages viewed</li>
                <li>Date and time of access</li>
                <li>Platform usage logs</li>
              </ul>
              <p className="mb-4">This information helps with security, functionality, analytics, and troubleshooting.</p>

              <h3 className="text-xl font-semibold mb-3 text-gray-900 dark:text-white">E. Communication Data</h3>
              <p className="mb-2">Messages sent through the platform may be stored securely to:</p>
              <ul className="list-disc list-inside space-y-2 ml-4 mb-4">
                <li>Support communication between users</li>
                <li>Investigate violations</li>
                <li>Enhance safety</li>
                <li>Improve platform features</li>
              </ul>
              <p>We do not scan or sell message content for advertising or marketing purposes.</p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
                2. How We Use Your Information
              </h2>
              <p className="mb-2">CashRidez uses your information to:</p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Maintain your account</li>
                <li>Process your monthly membership</li>
                <li>Verify identity</li>
                <li>Enable trip posting and communication between members</li>
                <li>Enhance platform safety</li>
                <li>Provide customer support</li>
                <li>Improve platform functionality</li>
                <li>Investigate violations and fraud</li>
                <li>Comply with legal obligations</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
                3. How We Share Your Information
              </h2>
              <p className="mb-3">We do not sell your information. We may share information only with:</p>
              
              <h3 className="text-xl font-semibold mb-3 text-gray-900 dark:text-white">A. Service Providers</h3>
              <p className="mb-2">These include:</p>
              <ul className="list-disc list-inside space-y-2 ml-4 mb-4">
                <li>Payment processors such as Stripe</li>
                <li>Supabase for secure database storage</li>
                <li>Verification partners</li>
                <li>Email or notification services</li>
              </ul>
              <p className="mb-4">All providers must follow strict confidentiality rules.</p>

              <h3 className="text-xl font-semibold mb-3 text-gray-900 dark:text-white">B. Other Users</h3>
              <p className="mb-4">
                Information you choose to post publicly, such as trip listings, may be visible to other members.
                Private messages are visible only to the users involved, unless legally required or needed for safety investigation.
              </p>

              <h3 className="text-xl font-semibold mb-3 text-gray-900 dark:text-white">C. Legal Requests</h3>
              <p className="mb-2">We may disclose information if required to:</p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Comply with laws or court orders</li>
                <li>Respond to law enforcement</li>
                <li>Protect the safety of users or the public</li>
                <li>Prevent fraud or harmful conduct</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
                4. Data Storage and Security
              </h2>
              <p className="mb-3">
                CashRidez uses secure third-party infrastructure such as Supabase and encrypted communication methods to store data.
              </p>
              <p className="mb-2">Security measures include:</p>
              <ul className="list-disc list-inside space-y-2 ml-4 mb-4">
                <li>Encryption at rest and in transit</li>
                <li>Access control and authentication</li>
                <li>Monitoring for unauthorized access</li>
                <li>Regular security reviews</li>
              </ul>
              <p>
                No system is entirely immune from risks. By using CashRidez, you agree that you understand and accept these risks.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
                5. User Choices and Controls
              </h2>
              
              <h3 className="text-xl font-semibold mb-3 text-gray-900 dark:text-white">A. Access and Updates</h3>
              <p className="mb-4">You may update your account information at any time through your profile settings.</p>

              <h3 className="text-xl font-semibold mb-3 text-gray-900 dark:text-white">B. Deleting Your Account</h3>
              <p className="mb-2">You may request account deletion by contacting:</p>
              <p className="mb-4">Email: cashridezconnect@gmail.com</p>
              <p className="mb-4">
                Some information may be retained as required for legal compliance, safety investigations, or transaction history.
              </p>

              <h3 className="text-xl font-semibold mb-3 text-gray-900 dark:text-white">C. Communication Preferences</h3>
              <p>
                You may opt out of promotional emails while still receiving essential account and safety notifications.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
                6. Cookies and Tracking Technologies
              </h2>
              <p className="mb-2">CashRidez may use cookies or similar tools to:</p>
              <ul className="list-disc list-inside space-y-2 ml-4 mb-4">
                <li>Recognize users</li>
                <li>Improve performance</li>
                <li>Maintain login sessions</li>
                <li>Analyze usage</li>
              </ul>
              <p>
                You may disable cookies in your browser settings, but some features may not function properly.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
                7. Children's Privacy
              </h2>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>CashRidez is not intended for individuals under 18</li>
                <li>We do not knowingly collect information from minors</li>
                <li>If we learn that a user is under 18, the account will be removed</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
                8. Third-Party Links
              </h2>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>The platform may link to third-party sites such as mapping tools or payment processors</li>
                <li>CashRidez is not responsible for the privacy practices or content of those sites</li>
                <li>Use them at your own discretion</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
                9. Data Retention
              </h2>
              <p className="mb-2">CashRidez retains information only as long as necessary for:</p>
              <ul className="list-disc list-inside space-y-2 ml-4 mb-4">
                <li>Operating the platform</li>
                <li>Compliance with law</li>
                <li>Security auditing</li>
                <li>Account history</li>
              </ul>
              <p>After retention periods, data may be deleted or anonymized.</p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
                10. International Users
              </h2>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>CashRidez is operated in the United States</li>
                <li>By using the platform, you consent to the transfer and storage of your information in the United States</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
                11. Changes to This Privacy Policy
              </h2>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Any changes to this Privacy Policy will be posted on this page with an updated date</li>
                <li>Continued use of the platform means you accept those changes</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
                12. Contact Information
              </h2>
              <p className="mb-2">For questions or requests, please contact:</p>
              <p className="mb-1">Cash Ridez Connect LLC</p>
              <p className="mb-1">8735 Dunwoody Place Suite R</p>
              <p className="mb-1">Atlanta, GA 30350</p>
              <p>Email: cashridezconnect@gmail.com</p>
            </section>
          </div>
        </Card>
      </div>
    </div>
  );
}
