import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function Community() {
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
            CashRidez Community Guidelines
          </h1>

          <div className="space-y-6 text-gray-700 dark:text-gray-300">
            <section>
              <p className="text-sm mb-6">
                <strong>Last Updated:</strong> November 2, 2025<br />
                <strong>Operated by:</strong> Cash Ridez Connect LLC, Atlanta, Georgia, USA
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
                1. Overview
              </h2>
              <p className="mb-3">
                CashRidez.com is a community platform where verified members communicate, post trips, and coordinate transportation within their communities. These Community Guidelines explain expected behavior and prohibited conduct. By using CashRidez you agree to follow these guidelines along with our <a href="/terms" className="text-primary hover:underline">Terms of Service</a>. CashRidez may update these guidelines at any time. Violations may result in warnings, suspension, or permanent removal.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
                2. Core Principles
              </h2>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li><strong>Respect.</strong> Treat every member with courtesy and professionalism.</li>
                <li><strong>Integrity.</strong> Be honest about identity, plans, and offers.</li>
                <li><strong>Safety.</strong> Prioritize the safety of yourself and others.</li>
                <li><strong>Accountability.</strong> Keep commitments and own your actions.</li>
                <li><strong>Community spirit.</strong> Contribute to a helpful and trustworthy environment.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
                3. Respectful Conduct
              </h2>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Do not use hate speech or discriminatory language.</li>
                <li>Do not harass, threaten, bully, or intimidate others.</li>
                <li>Do not share explicit violent or otherwise offensive content.</li>
                <li>Do not spam or promote unrelated services or businesses.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
                4. Honest Communication
              </h2>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Provide accurate trip and profile information.</li>
                <li>Communicate clearly about timing locations and trip conditions.</li>
                <li>Honor accepted trip requests or cancel with reasonable notice.</li>
                <li>Do not create fake accounts or misrepresent identity.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
                5. Safety Expectations
              </h2>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Follow all traffic safety and insurance laws in your location.</li>
                <li>Do not use the platform while under the influence of drugs or alcohol.</li>
                <li>Do not carry weapons or illegal items during trips.</li>
                <li>Respect personal boundaries and privacy at all times.</li>
                <li>Report unsafe behavior or incidents to cashridezconnect@gmail.com.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
                6. Content Posting Rules
              </h2>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Only post information that is accurate and relevant to trips or community coordination.</li>
                <li>Do not post content involving illegal goods substances or activities.</li>
                <li>Do not advertise chain messages or spam.</li>
                <li>Do not share private information about others without consent including phone numbers addresses license plates or personal documents.</li>
                <li>All postings must comply with these guidelines and the <a href="/terms" className="text-primary hover:underline">Terms of Service</a>.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
                7. Privacy and Data Responsibility
              </h2>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Respect the privacy of all users.</li>
                <li>Do not share screenshots conversations or trip details outside CashRidez without permission.</li>
                <li>Do not use member data for marketing or commercial purposes without explicit consent.</li>
                <li>Report suspected privacy issues or data misuse to cashridezconnect@gmail.com.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
                8. Fair Use and No Exploitation
              </h2>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>CashRidez is a peer to peer communication platform.</li>
                <li>Do not solicit members for unrelated employment network marketing or promotions.</li>
                <li>Do not create fake trips fake accounts or manipulate ratings.</li>
                <li>Do not attempt to scrape harvest or sell member data.</li>
                <li>Do not attempt to bypass membership fees or access controls.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
                9. Reporting Violations
              </h2>
              <p className="mb-3">
                If you experience or witness misconduct unsafe activity or harassment contact:
              </p>
              <p className="mb-3">
                <strong>Email:</strong> cashridezconnect@gmail.com
              </p>
              <p className="mb-3">
                Include the username of the person involved the date and a brief description. Attach screenshots or trip details if available. CashRidez reviews reports and may take action up to permanent removal.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
                10. Enforcement
              </h2>
              <p className="mb-3">
                CashRidez may take one or more actions at its sole discretion:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4 mb-3">
                <li>One written warning</li>
                <li>Temporary suspension of access</li>
                <li>Permanent account termination</li>
                <li>Notice to law enforcement when required</li>
              </ul>
              <p>All enforcement decisions are final.</p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
                11. Disclaimer
              </h2>
              <p className="mb-3">
                CashRidez is a community communication platform. CashRidez does not manage rides employ drivers operate vehicles or guarantee outcomes. Each user is responsible for personal conduct vehicles and interactions. By using the platform you acknowledge that you participate at your own risk and agree to follow all applicable laws and standards.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
                12. Contact Information
              </h2>
              <p className="mb-3">
                Cash Ridez Connect LLC<br />
                8735 Dunwoody Place Suite R<br />
                Atlanta GA 30350<br />
                Email: cashridezconnect@gmail.com
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
                13. Link to Terms
              </h2>
              <p>
                Use of the platform is also governed by the <a href="/terms" className="text-primary hover:underline">Terms of Service</a> available on CashRidez.com.
              </p>
            </section>
          </div>
        </Card>
      </div>
    </div>
  );
}
