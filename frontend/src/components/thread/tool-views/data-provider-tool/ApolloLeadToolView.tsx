import React from 'react';
import {
  User,
  CheckCircle,
  AlertTriangle,
  Loader2,
  Mail,
  Phone,
  Building2,
  MapPin,
  Briefcase,
  Clock,
  Globe,
  Linkedin,
  Users,
  DollarSign,
  Calendar
} from 'lucide-react';
import { ToolViewProps } from '../types';
import { formatTimestamp } from '../utils';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

interface PhoneNumber {
  raw_number?: string;
  sanitized_number?: string;
  type?: string | null;
  status?: string;
  dnc_status?: string | null;
}

interface EmploymentHistory {
  title: string;
  organization_name: string;
  start_date?: string;
  end_date?: string | null;
  current: boolean;
}

interface Organization {
  name: string;
  website_url?: string;
  linkedin_url?: string;
  logo_url?: string;
  estimated_num_employees?: number;
  industry?: string;
  founded_year?: number;
  annual_revenue?: number;
  annual_revenue_printed?: string;
  city?: string;
  state?: string;
  country?: string;
}

interface Person {
  id: string;
  first_name: string;
  last_name: string;
  name: string;
  title?: string;
  email?: string;
  email_status?: string;
  linkedin_url?: string;
  city?: string;
  state?: string;
  country?: string;
  photo_url?: string;
  employment_history?: EmploymentHistory[];
  organization?: Organization;
  contact?: {
    phone_numbers?: PhoneNumber[];
  };
}

interface ApolloLeadData {
  person?: Person;
  status?: string;
  message?: string;
  webhook_id?: string;
}

function extractApolloLeadData(
  assistantContent: any,
  toolContent: any,
  isSuccess: boolean
): {
  data: ApolloLeadData | null;
  isSuccess: boolean;
  isPending: boolean;
} {
  let data: ApolloLeadData | null = null;
  let actualIsSuccess = isSuccess;
  let isPending = false;

  // Try to parse tool content
  if (toolContent) {
    if (typeof toolContent === 'string') {
      try {
        const parsed = JSON.parse(toolContent);
        if (parsed.result) {
          data = parsed.result;
        } else {
          data = parsed;
        }
      } catch {
        data = null;
      }
    } else if (typeof toolContent === 'object') {
      if (toolContent.result) {
        data = toolContent.result;
      } else {
        data = toolContent;
      }
    }
  }

  // Check if it's a pending phone reveal
  if (data?.status === 'pending') {
    isPending = true;
    actualIsSuccess = true;
  }

  return { data, isSuccess: actualIsSuccess, isPending };
}

export function ApolloLeadToolView({
  name = 'apollo-match-lead',
  assistantContent,
  toolContent,
  assistantTimestamp,
  toolTimestamp,
  isSuccess = true,
  isStreaming = false,
}: ToolViewProps) {
  const { data, isSuccess: actualIsSuccess, isPending } = extractApolloLeadData(
    assistantContent,
    toolContent,
    isSuccess
  );

  const person = data?.person;
  const isPhoneReveal = name === 'apollo-reveal-phone' || name === 'apollo_reveal_phone';

  // Pending phone reveal state
  if (isPending) {
    return (
      <Card className="gap-0 flex border shadow-none border-t border-b-0 border-x-0 p-0 rounded-none flex-col h-full overflow-hidden bg-card">
        <CardHeader className="h-14 bg-gradient-to-r from-blue-50/80 to-indigo-50/80 dark:from-blue-900/20 dark:to-indigo-900/20 backdrop-blur-sm border-b p-2 px-4 space-y-2">
          <div className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="relative p-2 rounded-xl bg-gradient-to-br from-blue-500/20 to-indigo-600/10 border border-blue-500/20">
                <Phone className="w-5 h-5 text-blue-500 dark:text-blue-400 animate-pulse" />
              </div>
              <div>
                <CardTitle className="text-base font-medium text-zinc-900 dark:text-zinc-100">
                  Phone Number Reveal Requested
                </CardTitle>
              </div>
            </div>
            <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800">
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              Pending
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="p-6 space-y-4">
          <div className="flex items-center gap-3 text-zinc-700 dark:text-zinc-300">
            <Clock className="h-5 w-5 text-blue-500" />
            <div>
              <p className="font-medium">{data?.message || 'Phone number reveal in progress...'}</p>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                You'll be notified when the phone number arrives.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!person) {
    return (
      <Card className="gap-0 flex border shadow-none border-t border-b-0 border-x-0 p-0 rounded-none flex-col h-full overflow-hidden bg-card">
        <CardHeader className="h-14 bg-zinc-50/80 dark:bg-zinc-900/80 backdrop-blur-sm border-b p-2 px-4 space-y-2">
          <div className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="relative p-2 rounded-xl bg-gradient-to-br from-orange-500/20 to-orange-600/10 border border-orange-500/20">
                <User className="w-5 h-5 text-orange-500 dark:text-orange-400" />
              </div>
              <div>
                <CardTitle className="text-base font-medium text-zinc-900 dark:text-zinc-100">
                  Apollo Lead Generation
                </CardTitle>
              </div>
            </div>
            <Badge variant="secondary" className="bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800">
              <AlertTriangle className="h-3 w-3 mr-1" />
              No Data
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">No lead data available.</p>
        </CardContent>
      </Card>
    );
  }

  const organization = person.organization;
  const phoneNumbers = person.contact?.phone_numbers || [];

  return (
    <Card className="gap-0 flex border shadow-none border-t border-b-0 border-x-0 p-0 rounded-none flex-col h-full overflow-hidden bg-card">
      <CardHeader className="h-14 bg-gradient-to-r from-blue-50/80 to-indigo-50/80 dark:from-blue-900/20 dark:to-indigo-900/20 backdrop-blur-sm border-b p-2 px-4 space-y-2">
        <div className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="relative p-2 rounded-xl bg-gradient-to-br from-blue-500/20 to-indigo-600/10 border border-blue-500/20">
              <User className="w-5 h-5 text-blue-500 dark:text-blue-400" />
            </div>
            <div>
              <CardTitle className="text-base font-medium text-zinc-900 dark:text-zinc-100">
                {isPhoneReveal ? 'Phone Number Revealed' : 'Lead Matched'}
              </CardTitle>
            </div>
          </div>

          {!isStreaming && (
            <Badge
              variant="secondary"
              className={cn(
                "text-xs font-medium",
                actualIsSuccess
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800"
                  : "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800"
              )}
            >
              {actualIsSuccess ? (
                <CheckCircle className="h-3 w-3 mr-1" />
              ) : (
                <AlertTriangle className="h-3 w-3 mr-1" />
              )}
              {actualIsSuccess ? 'Success' : 'Failed'}
            </Badge>
          )}
        </div>
      </CardHeader>

      <ScrollArea className="flex-1">
        <CardContent className="p-6 space-y-6">
          {/* Person Header */}
          <div className="flex items-start gap-4">
            {person.photo_url && (
              <img
                src={person.photo_url}
                alt={person.name}
                className="w-16 h-16 rounded-full border-2 border-zinc-200 dark:border-zinc-700"
              />
            )}
            <div className="flex-1">
              <h3 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
                {person.name}
              </h3>
              {person.title && (
                <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
                  {person.title}
                </p>
              )}
              {organization?.name && (
                <p className="text-sm text-zinc-500 dark:text-zinc-500 mt-1 flex items-center gap-1">
                  <Building2 className="h-3 w-3" />
                  {organization.name}
                </p>
              )}
            </div>
          </div>

          <Separator />

          {/* Contact Information */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Contact Information
            </h4>
            
            {person.email && (
              <div className="flex items-center gap-2 text-sm">
                <Badge variant="secondary" className={cn(
                  person.email_status === 'verified'
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300"
                    : "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-300"
                )}>
                  {person.email_status || 'Unknown'}
                </Badge>
                <a
                  href={`mailto:${person.email}`}
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  {person.email}
                </a>
              </div>
            )}

            {phoneNumbers.length > 0 && (
              <div className="space-y-2">
                {phoneNumbers.map((phone, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-sm">
                    <Phone className="h-4 w-4 text-zinc-500" />
                    <a
                      href={`tel:${phone.sanitized_number || phone.raw_number}`}
                      className="text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      {phone.raw_number || phone.sanitized_number}
                    </a>
                    {phone.type && (
                      <Badge variant="outline" className="text-xs">
                        {phone.type}
                      </Badge>
                    )}
                    {phone.status && (
                      <Badge variant="secondary" className="text-xs">
                        {phone.status}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            )}

            {person.linkedin_url && (
              <div className="flex items-center gap-2 text-sm">
                <Linkedin className="h-4 w-4 text-blue-600" />
                <a
                  href={person.linkedin_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  LinkedIn Profile
                </a>
              </div>
            )}

            {(person.city || person.state || person.country) && (
              <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                <MapPin className="h-4 w-4" />
                {[person.city, person.state, person.country].filter(Boolean).join(', ')}
              </div>
            )}
          </div>

          {/* Employment History */}
          {person.employment_history && person.employment_history.length > 0 && (
            <>
              <Separator />
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                  <Briefcase className="h-4 w-4" />
                  Employment History
                </h4>
                <div className="space-y-3">
                  {person.employment_history.slice(0, 5).map((job, idx) => (
                    <div key={idx} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className={cn(
                          "w-2 h-2 rounded-full mt-1",
                          job.current ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-600"
                        )} />
                        {idx < person.employment_history!.length - 1 && (
                          <div className="w-px h-full bg-zinc-200 dark:bg-zinc-700 mt-1" />
                        )}
                      </div>
                      <div className="flex-1 pb-3">
                        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                          {job.title}
                        </p>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                          {job.organization_name}
                        </p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-500 mt-1">
                          {job.start_date && new Date(job.start_date).getFullYear()} -{' '}
                          {job.current ? 'Present' : job.end_date && new Date(job.end_date).getFullYear()}
                          {job.current && (
                            <Badge variant="secondary" className="ml-2 text-xs bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300">
                              Current
                            </Badge>
                          )}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Organization Details */}
          {organization && (
            <>
              <Separator />
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  Organization
                </h4>
                
                <div className="flex items-start gap-3">
                  {organization.logo_url && (
                    <img
                      src={organization.logo_url}
                      alt={organization.name}
                      className="w-12 h-12 rounded border border-zinc-200 dark:border-zinc-700"
                    />
                  )}
                  <div className="flex-1 space-y-2">
                    <p className="text-base font-medium text-zinc-900 dark:text-zinc-100">
                      {organization.name}
                    </p>
                    
                    {organization.industry && (
                      <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                        <Badge variant="outline">{organization.industry}</Badge>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-3 text-sm text-zinc-600 dark:text-zinc-400">
                      {organization.estimated_num_employees && (
                        <div className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {organization.estimated_num_employees.toLocaleString()} employees
                        </div>
                      )}
                      
                      {organization.founded_year && (
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          Founded {organization.founded_year}
                        </div>
                      )}
                      
                      {organization.annual_revenue_printed && (
                        <div className="flex items-center gap-1">
                          <DollarSign className="h-3 w-3" />
                          ${organization.annual_revenue_printed} revenue
                        </div>
                      )}
                    </div>

                    {(organization.city || organization.state || organization.country) && (
                      <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                        <MapPin className="h-4 w-4" />
                        {[organization.city, organization.state, organization.country].filter(Boolean).join(', ')}
                      </div>
                    )}

                    {organization.website_url && (
                      <a
                        href={organization.website_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        <Globe className="h-3 w-3" />
                        Visit Website
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Timestamps */}
          {(toolTimestamp || assistantTimestamp) && (
            <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center gap-4 text-xs text-zinc-500 dark:text-zinc-400">
                {toolTimestamp && (
                  <span>Retrieved: {formatTimestamp(toolTimestamp)}</span>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </ScrollArea>
    </Card>
  );
}

