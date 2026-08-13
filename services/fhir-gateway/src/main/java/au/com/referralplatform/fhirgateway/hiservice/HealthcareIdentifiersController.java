package au.com.referralplatform.fhirgateway.hiservice;

import au.com.referralplatform.fhirgateway.hiservice.dto.HpiIRecord;
import au.com.referralplatform.fhirgateway.hiservice.dto.HpiORecord;
import au.com.referralplatform.fhirgateway.hiservice.dto.IhiLookupRequest;
import au.com.referralplatform.fhirgateway.hiservice.dto.IhiRecord;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Internal API other services call to resolve a verified IHI/HPI-O/HPI-I
 * before a dependent action (e.g. finalising a referral's identifiers before
 * routing). See {@link HealthcareIdentifiersService} — every lookup either
 * returns a verified record or fails with a clear, typed error
 * ({@link HealthcareIdentifierLookupException}, mapped to HTTP 424 by
 * {@link au.com.referralplatform.fhirgateway.common.GlobalExceptionHandler}) —
 * never a silent guess.
 */
@RestController
@RequestMapping("/hi-service")
public class HealthcareIdentifiersController {

  private final HealthcareIdentifiersService hiService;

  public HealthcareIdentifiersController(HealthcareIdentifiersService hiService) {
    this.hiService = hiService;
  }

  @PostMapping("/ihi/lookup")
  public IhiRecord lookupIhi(@Valid @RequestBody IhiLookupRequest request) throws HealthcareIdentifierLookupException {
    return hiService.lookupIhi(request);
  }

  @GetMapping("/hpi-o/{hpiO}")
  public HpiORecord lookupHpiO(@PathVariable String hpiO) throws HealthcareIdentifierLookupException {
    return hiService.lookupHpiO(hpiO);
  }

  @GetMapping("/hpi-i/{hpiI}")
  public HpiIRecord lookupHpiI(@PathVariable String hpiI) throws HealthcareIdentifierLookupException {
    return hiService.lookupHpiI(hpiI);
  }
}
